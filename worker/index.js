// Cloudflare Worker: serves the static app (public/) and a small API.
// Adapted from the articulation app's worker (same API shape), switched to Spanish.
//
//   GET  /api/health      → { stt, tts, backend, model, voices }
//   POST /api/transcribe  → body: audio/wav (16 kHz mono) → { text, words }
//   GET  /api/tts?text=…&voice=estrella → audio/mpeg
//   POST /api/progress              → body: progress JSON → { code }   (new save code)
//   GET  /api/progress/OSO-XXXXX-XXXXX → the saved progress
//   PUT  /api/progress/OSO-XXXXX-XXXXX → body: progress JSON → { ok }  (replace; the app merges first)
//   POST /api/judge       → body: {scene, context, intent, expected, said} → {ok, note}
//                            ("does this reply make sense here?" for rounds without words)
//
// Optional secret APP_PASSCODE: when set, API calls need header x-app-passcode.

import { JUDGE_MODEL, cleanJudgeRequest, judgeMessages, parseJudge } from "../public/js/judge.js";

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
      const pm = url.pathname.match(/^\/api\/progress(?:\/([^/]+))?$/);
      if (pm) return await progress(request, env, pm[1]);
      switch (`${request.method} ${url.pathname}`) {
        case "GET /api/health":
          return json({ stt: !!env.AI, tts: !!env.AI, backend: "Cloudflare Workers AI", model: STT_MODEL.split("/").pop(), judge: !!env.AI, voices: TTS_VOICE_INFO });
        case "POST /api/transcribe": {
          const audio = await request.arrayBuffer();
          if (!audio.byteLength) return json({ error: "empty audio" }, 400);
          if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "audio too long" }, 413);
          if (env.STT_ORIGIN) {
            const r = await macTranscribe(audio, env).catch((e) => (console.warn("Mac speech check failed, using Workers AI:", String(e?.message ?? e)), null));
            if (r) return r;
          }
          return await transcribe(audio, env);
        }
        case "POST /api/judge":
          return await judge(request, env);
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

// Speech check on your own server (Whisper on a Mac), same answer shape. Falls back to Workers AI.
async function macTranscribe(audio, env) {
  const q = new URLSearchParams({ lang: "es", prompt: STT_PROMPT });
  const r = await fetch(`${env.STT_ORIGIN.replace(/\/+$/, "")}/api/transcribe?${q}`, {
    method: "POST",
    headers: { "content-type": "audio/wav", ...(env.TTS_TOKEN ? { authorization: `Bearer ${env.TTS_TOKEN}` } : {}) },
    body: audio,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`origin ${r.status}`);
  const out = await r.json();
  if (typeof out.text !== "string") throw new Error("bad answer");
  return json(out);
}

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

// ── Save codes ──
// A code is the only key to a learner's progress (no accounts), so it's long and random:
// 10 characters from a 31-letter alphabet without look-alikes (no 0/O, 1/I/L) ≈ 50 bits.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_RE = /^OSO-[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/;
const MAX_PROGRESS_BYTES = 256 * 1024;
const PROGRESS_TTL = 60 * 60 * 24 * 400; // kept 400 days after the last save

export function newCode(rand = crypto.getRandomValues(new Uint8Array(10))) {
  const c = [...rand].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `OSO-${c.slice(0, 5)}-${c.slice(5)}`;
}

/** Tidy what people type: "oso 7kq2m rx4pa" → "OSO-7KQ2M-RX4PA". */
export function cleanCode(raw) {
  const c = String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^OSO/, "");
  return c.length === 10 ? `OSO-${c.slice(0, 5)}-${c.slice(5)}` : null;
}

async function readProgressBody(request) {
  const text = await request.text();
  if (!text || text.length > MAX_PROGRESS_BYTES) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && typeof v.skits === "object" ? text : null;
  } catch { return null; }
}

async function progress(request, env, rawCode) {
  if (!env.PROGRESS) return json({ error: "progress saving is not set up" }, 503);
  if (!rawCode) {
    if (request.method !== "POST") return json({ error: "not found" }, 404);
    const body = await readProgressBody(request);
    if (!body) return json({ error: "bad progress" }, 400);
    let code;
    for (let i = 0; i < 5; i++) {
      code = newCode();
      if (!(await env.PROGRESS.get(`p:${code}`))) break;
    }
    await env.PROGRESS.put(`p:${code}`, body, { expirationTtl: PROGRESS_TTL });
    return json({ code });
  }
  const code = cleanCode(rawCode);
  if (!code || !CODE_RE.test(code)) return json({ error: "That isn’t a save code. It looks like OSO-7KQ2M-RX4PA." }, 400);
  const key = `p:${code}`;
  if (request.method === "GET") {
    const v = await env.PROGRESS.get(key);
    if (!v) return json({ error: "No progress was found for that code. Check the letters and try again." }, 404);
    return new Response(v, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (request.method === "PUT") {
    if (!(await env.PROGRESS.get(key))) return json({ error: "unknown code" }, 404); // codes are only made by POST
    const body = await readProgressBody(request);
    if (!body) return json({ error: "bad progress" }, 400);
    await env.PROGRESS.put(key, body, { expirationTtl: PROGRESS_TTL });
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

async function judge(request, env) {
  const r = cleanJudgeRequest(await request.json().catch(() => null));
  if (!r) return json({ error: "missing said" }, 400);
  const out = await env.AI.run(JUDGE_MODEL, { messages: judgeMessages(r), max_tokens: 120, temperature: 0 });
  const v = parseJudge(out);
  if (!v) return json({ error: "judge gave no answer" }, 502);
  return json(v);
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
