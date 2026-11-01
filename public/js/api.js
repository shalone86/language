// Talks to the backend (Cloudflare Worker or the self-hosted server — same API).

import { settings } from "./store.js";

const headers = () => (settings().passcode ? { "x-app-passcode": settings().passcode } : {});

let healthCache;
/** { stt: bool, tts: bool, backend: string, model: string } — never throws. */
export async function health(force = false) {
  if (healthCache && !force) return healthCache;
  try {
    const r = await fetch("api/health", { headers: headers() });
    healthCache = r.ok ? await r.json() : { stt: false, tts: false, error: `HTTP ${r.status}` };
  } catch (e) {
    healthCache = { stt: false, tts: false, error: "No backend reachable (static hosting?)" };
  }
  return healthCache;
}

/**
 * Send a WAV blob to Whisper. Returns { text, words?, scores? }.
 * candidates (optional): words to score by forced choice (self-hosted backend only).
 */
export async function transcribe(wav, candidates = []) {
  const q = candidates.length ? `?candidates=${encodeURIComponent(candidates.join(","))}` : "";
  const r = await fetch(`api/transcribe${q}`, {
    method: "POST",
    headers: { "content-type": "audio/wav", ...headers() },
    body: wav,
  });
  if (r.status === 401) throw new Error("The passcode is missing or wrong. Set it in Settings.");
  if (!r.ok) throw new Error(`Speech check failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Fetch server TTS audio as a Blob (or throw). */
export async function serverTts(text, voice) {
  // TTS audio is cached for a month; bump v when the server's voice output changes.
  const q = new URLSearchParams({ text, voice: voice || "", v: "1" });
  const r = await fetch(`api/tts?${q}`, { headers: headers() });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return r.blob();
}
