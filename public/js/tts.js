// Text-to-speech: the server voice (Workers AI / Deepgram Aura-2 Spanish) when available,
// otherwise the browser's built-in Spanish voice.
//
// Copied from the articulation app, where these reliability fixes were learned the hard way:
// - Chrome's speechSynthesis can get stuck: speak() right after cancel() is dropped, or onend
//   never fires. We keep a reference to the utterance, wait a beat after cancel(), watch for a
//   start event, and reset the engine if it never starts.
// - Mobile browsers only allow audio playback during a tap. Skit lines are prefetched when a
//   skit opens, and one <audio> element is reused, so lines play without a round trip.
// - Every playback promise settles (ended, paused, error or timeout), so a failed play can
//   never block the skit.
// Changed for Spanish: each call names a voice (each skit character has one), and the
// browser fallback prefers Mexican / US / Latin American Spanish voices.

import { settings } from "./store.js";
import { health, serverTts } from "./api.js";

const cache = new Map(); // `${voice}|${text}` → Promise<object URL>
const player = typeof Audio !== "undefined" ? new Audio() : null;
let playId = 0;
let utterance; // keep a reference: Chrome drops events for GC'd utterances

export function browserVoices() {
  if (typeof speechSynthesis === "undefined") return [];
  return speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
}

function pickVoice(gender) {
  const voices = browserVoices();
  const chosen = voices.find((v) => v.name === settings().browserVoice);
  if (chosen) return chosen;
  for (const re of [/es[-_]MX/i, /es[-_]US/i, /es[-_]419/i, /es[-_](CO|AR|CL|PE)/i, /es/i]) {
    const pool = voices.filter((v) => re.test(v.lang));
    if (!pool.length) continue;
    const g = gender === "m" ? /jorge|juan|diego|carlos|pablo|male|hombre/i : /paulina|sabina|dalia|monica|female|mujer/i;
    return pool.find((v) => g.test(v.name)) ?? pool.find((v) => /natural|neural|enhanced|premium|google/i.test(v.name)) ?? pool[0];
  }
  return null;
}

async function useServer() {
  const src = settings().ttsSource;
  if (src === "browser") return false;
  if (src === "server") return true;
  return !!(await health()).tts;
}

function serverUrl(text, voice) {
  const key = `${voice}|${text}`;
  if (!cache.has(key)) {
    const p = serverTts(text, voice).then((blob) => URL.createObjectURL(blob));
    p.catch(() => cache.delete(key)); // let a later tap retry
    cache.set(key, p);
  }
  return cache.get(key);
}

/** Warm the cache for [text, voice] pairs the learner will hear next. Never throws. */
export async function prefetch(items) {
  try {
    if (!(await useServer())) return;
    for (const [t, v] of items) serverUrl(t, v).catch(() => {});
  } catch { /* offline — the browser voice will be used */ }
}

export function stop() {
  playId++;
  if (player && !player.paused) player.pause();
  if (typeof speechSynthesis !== "undefined" && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function playThrough(url, rate, id) {
  return new Promise((resolve, reject) => {
    const done = () => { player.onended = player.onpause = player.onerror = null; clearTimeout(timer); resolve(); };
    player.onended = player.onpause = done;
    player.onerror = () => { done(); reject(new Error("Audio could not be played.")); };
    const timer = setTimeout(done, 30000);
    player.src = url;
    player.preservesPitch = true;
    player.playbackRate = rate;
    player.play().catch((e) => { done(); if (id === playId) reject(e); });
  });
}

async function speakBrowser(text, rate, id, gender) {
  if (typeof speechSynthesis === "undefined") throw new Error("This device can’t speak text aloud.");
  const synth = speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    await sleep(80);
  }
  if (id !== playId) return;
  synth.resume();
  const attempt = () => new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    utterance = u;
    const v = pickVoice(gender);
    if (v) u.voice = v;
    u.lang = v?.lang ?? "es-MX";
    u.rate = rate;
    let started = false;
    const finish = (ok) => { clearTimeout(startTimer); clearTimeout(endTimer); resolve(ok); };
    u.onstart = () => { started = true; };
    u.onend = () => finish(true);
    u.onerror = () => finish(started);
    const startTimer = setTimeout(() => !started && finish(false), 1500);
    const endTimer = setTimeout(() => finish(true), 2500 + text.length * 120 / rate);
    synth.speak(u);
  });
  if (await attempt()) return;
  if (id !== playId) return;
  synth.cancel();
  await sleep(150);
  if (!(await attempt())) throw new Error("The device voice didn’t respond. Try again, or pick another voice in Settings.");
}

/**
 * Say text aloud in a character's voice. slow=true plays at ~65% speed.
 * Resolves when playback ends.
 */
export async function speak(text, { voice = "estrella", gender = "f", slow = false, rate = 1 } = {}) {
  stop();
  const id = playId;
  const r = rate * (slow ? 0.65 : 1);
  if (player && (await useServer())) {
    try {
      const url = await serverUrl(text, voice);
      if (id !== playId) return;
      return await playThrough(url, r, id);
    } catch (e) {
      console.warn("Server voice failed, using the device voice", e);
      if (id !== playId) return;
    }
  }
  return speakBrowser(text, r, id, gender);
}

/** Play a recorded clip (object URL). */
export async function playUrl(url) {
  stop();
  if (!player) return;
  return playThrough(url, 1, playId);
}

if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
