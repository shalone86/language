// Cloudflare Worker: serves the static app (public/) and a small API.
// Adapted from the articulation app's worker (same API shape), switched to Spanish.
//
//   GET  /api/health      → { stt, tts, backend, model, voices }
//   POST /api/transcribe  → body: audio/wav (16 kHz mono) → { text, words }
//   GET  /api/tts?text=…&voice=estrella → audio/mpeg
//
// Optional secret APP_PASSCODE: when set, API calls need header x-app-passcode.

const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const TTS_MODEL = "@cf/deepgram/aura-2-es";
// Aura-2 Spanish voices available on Workers AI, with the accent Deepgram lists for each.
// The skits pick a voice per character (public/js/data/skits.js).
const TTS_VOICE_INFO = {
  estrella: "Mexican, female",
  sirio: "Mexican, male",
  javier: "Mexican, male",
  celeste: "Colombian, female",
  selena: "Latin American, female",
  aquila: "Latin American, male",
  carina: "Spain, female",
  diana: "Spain, female",
  nestor: "Spain, male",
  alvaro: "Spain, male",
};
const TTS_VOICES = new Set(Object.keys(TTS_VOICE_INFO));
const DEFAULT_VOICE = "estrella";
const ORIGIN_TIMEOUT_MS = 8000; // a sleeping Mac shouldn't keep a learner waiting
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // ~60 s of 16 kHz mono WAV

// Spelling hints for Whisper. This only nudges *how* slang gets written (güey, not "way"),
// it never contains the line being practiced, so it can't make a wrong attempt look right.
const STT_PROMPT = "Conversación informal en español de México y Latinoamérica: güey, neta, chido, órale, quiubo, parce, che, cachai, po, wepa.";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (env.APP_PASSCODE && request.headers.get("x-app-passcode") !== env.APP_PASSCODE) {
      return json({ error: "passcode required" }, 401);
    }
    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/health":
          return json({ stt: !!env.AI, tts: !!env.AI, backend: "Cloudflare Workers AI", model: STT_MODEL.split("/").pop(), voices: TTS_VOICE_INFO });
        case "POST /api/transcribe": {
          const audio = await request.arrayBuffer();
          if (!audio.byteLength) return json({ error: "empty audio" }, 400);
          if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "audio too long" }, 413);
          return await transcribe(audio, env);
        }
        case "GET /api/tts":
          return await tts(url, env, ctx);
        default:
          return json({ error: "not found" }, 404);
      }
    } catch (e) {
      console.error(e);
      return json({ error: String(e?.message ?? e) }, 500);
    }
  },
};

async function transcribe(audio, env) {
  const out = await env.AI.run(STT_MODEL, {
    audio: toBase64(audio),
    task: "transcribe",
    // Force Spanish: with an English accent, language detection can pick English
    // and "translate" the attempt, which would hide exactly what we want to check.
    language: "es",
    initial_prompt: STT_PROMPT,
    condition_on_previous_text: false,
    vad_filter: false,
  });
  const words = (out.segments ?? []).flatMap((s) => s.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  return json({ text: (out.text ?? "").trim(), words });
}

async function tts(url, env, ctx) {
  const text = (url.searchParams.get("text") ?? "").trim().slice(0, 400);
  if (!text) return json({ error: "missing text" }, 400);
  const voice = TTS_VOICES.has(url.searchParams.get("voice")) ? url.searchParams.get("voice") : DEFAULT_VOICE;


  // 1. Your own voice server, if TTS_ORIGIN is set (free, unlimited). Falls back to Workers AI.
  if (env.TTS_ORIGIN) {
    const own = ownVoice(voice, env);
    const ownKey = new Request(`https://tts.cache/own/${encodeURIComponent(own)}/${encodeURIComponent(text)}`);
    const ownHit = await caches.default.match(ownKey);
    if (ownHit) return ownHit;
    try {
      const res = new Response(await fromOrigin(text, own, env), {
        headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=2592000", "x-voice-source": "own" },
      });
      ctx.waitUntil(caches.default.put(ownKey, res.clone()));
      return res;
    } catch (e) {
      console.warn("voice server unavailable, using Workers AI:", String(e?.message ?? e));
    }
  }

  // 2. Workers AI. Same text + voice → same audio, so cache it at the edge (skit lines repeat a lot).
  const cacheKey = new Request(`https://tts.cache/aura-2-es/${voice}/${encodeURIComponent(text)}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const raw = await env.AI.run(TTS_MODEL, { text, speaker: voice, encoding: "mp3" }, { returnRawResponse: true });
  if (!raw.ok) return json({ error: `tts failed (${raw.status})` }, 502);
  const res = new Response(raw.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=2592000", "x-voice-source": "aura" },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// Kokoro has one Spanish woman (ef_dora) and two men (em_alex, em_santa). Each character keeps
// the same one, so a skit still sounds like different people (just not different accents).
function ownVoice(voice, env) {
  if (/female/.test(TTS_VOICE_INFO[voice])) return env.TTS_VOICE_F || "ef_dora";
  const h = [...voice].reduce((a, c) => a + c.charCodeAt(0), 0);
  return h % 2 ? "em_alex" : "em_santa";
}

// Your own voice server (e.g. Kokoro on a Mac) speaking the OpenAI-style API. Throws if it's down.
async function fromOrigin(text, voice, env) {
  const headers = { "content-type": "application/json" };
  if (env.TTS_TOKEN) headers.authorization = `Bearer ${env.TTS_TOKEN}`;
  const r = await fetch(`${env.TTS_ORIGIN.replace(/\/+$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: env.TTS_MODEL || "kokoro", input: text, voice, response_format: "mp3", speed: 1 }),
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
  });
  const type = r.headers.get("content-type") ?? "";
  if (!r.ok || !/audio|octet-stream/.test(type)) throw new Error(`voice server answered ${r.status} ${type}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 500) throw new Error("voice server sent an empty clip");
  return buf;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
