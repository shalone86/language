// Settings and progress, kept in this browser's localStorage (same approach as articulation).
// The rules (streaks, rounds, review schedule) live in progress.js; this file only stores.

import { localDay, streakStats, wordsOf, reviewed, firstSchedule, dueItems } from "./progress.js";

// The app was first called Hablar. The storage key keeps that name so nobody loses progress.
const KEY = "hablar:v1";

const DEFAULTS = {
  settings: {
    echo: "auto", // hear my line before I say it: auto (level 1, round 1) | on | off
    handsFree: false, // start listening as soon as it's your turn
    slowAi: false, // the other characters talk slower
    showEn: false, // show English under every line
    ttsSource: "auto", // auto | server | browser
    browserVoice: "",
    passcode: "",
    unlockAll: false,
    sounds: true, // button and answer sound effects
  },
  skits: {}, // id → { plays, done, rounds (0–3), at }
  phrases: {}, // "skitId|es" → { es, en, skit, line, at, said, box, due, reviews, misses }
  words: {}, // normalized word → { n, first }
  days: {}, // "YYYY-MM-DD" → { lines, passed, seconds, skits, reviews }
};

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return migrate({ ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } });
  } catch { /* private mode or corrupted — fall through */ }
  return structuredClone(DEFAULTS);
}

/** Bring older saves up to date without losing anything. */
function migrate(s) {
  // v1 kept only { streak: {day, count} }: rebuild those days.
  if (s.streak?.day && !Object.keys(s.days ?? {}).length) {
    s.days = {};
    for (let i = 0; i < s.streak.count; i++) {
      const d = new Date(`${s.streak.day}T12:00:00`);
      d.setDate(d.getDate() - i);
      s.days[localDay(d)] = { lines: 0, passed: 0, seconds: 0, skits: 0, reviews: 0 };
    }
  }
  delete s.streak;
  // v1 settings.support → echo
  if (s.settings.support) {
    if (s.settings.support === "echo") s.settings.echo = "on";
    delete s.settings.support;
  }
  for (const p of Object.values(s.skits)) p.rounds ??= p.done ? 1 : 0;
  for (const p of Object.values(s.phrases)) if (!p.due) Object.assign(p, firstSchedule(localDay(new Date(p.at || Date.now()))));
  // Words from phrases learned before word tracking existed.
  if (!Object.keys(s.words).length) for (const p of Object.values(s.phrases)) countWords(s, wordsOf(p.line ?? ""), p.at);
  return s;
}

let saveOk = true;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveOk = true; } catch { saveOk = false; /* storage blocked or full */ }
}

/**
 * Can this browser keep progress? False in some private modes, with site data blocked,
 * or when storage is full. The app warns instead of silently losing progress.
 */
export function storageWorks() {
  try {
    const k = `${KEY}:probe`;
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok && saveOk;
  } catch { return false; }
}

/** Ask the browser not to clear our data when space runs low (granted silently where allowed). */
export async function askToKeepData() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

// ───────────────────────── activity ─────────────────────────

function today() {
  return (state.days[localDay()] ??= { lines: 0, passed: 0, seconds: 0, skits: 0, reviews: 0 });
}

/** Practicing at all (opening a skit, listening, trying) counts as using the app today. */
export function markActive() {
  today();
  save();
}

/** A spoken attempt that the speech checker heard. */
export function recordAttempt({ seconds = 0, passed = false } = {}) {
  const d = today();
  d.lines++;
  d.seconds = Math.round((d.seconds + seconds) * 10) / 10;
  if (passed) d.passed++;
  save();
}

function countWords(s, words, at = Date.now()) {
  for (const w of words) {
    const e = (s.words[w] ??= { n: 0, first: at });
    e.n++;
  }
}

/** Words the learner said correctly (normalized, from score.js tokens). */
export function learnWords(words) {
  if (!words?.length) return;
  countWords(state, words);
  save();
}

/** Everything the progress page shows. */
export function stats() {
  const days = Object.keys(state.days);
  const s = streakStats(days);
  const totals = Object.values(state.days).reduce((a, d) => ({
    lines: a.lines + (d.lines ?? 0), passed: a.passed + (d.passed ?? 0), seconds: a.seconds + (d.seconds ?? 0),
  }), { lines: 0, passed: 0, seconds: 0 });
  return {
    ...s,
    ...totals,
    words: Object.keys(state.words).length,
    phrases: Object.keys(state.phrases).length,
    skitsDone: Object.values(state.skits).filter((p) => p.done).length,
    roundsDone: Object.values(state.skits).reduce((a, p) => a + (p.rounds ?? 0), 0),
    due: dueItems(Object.values(state.phrases), localDay(), Infinity).length,
  };
}

/** { "YYYY-MM-DD": {lines, passed, seconds, …} } for the activity calendar. */
export const activity = () => state.days;

// ───────────────────────── skits ─────────────────────────

export const skitProgress = (id) => state.skits[id] ?? { plays: 0, done: 0, rounds: 0 };

export function startSkit(id) {
  const p = (state.skits[id] ??= { plays: 0, done: 0, rounds: 0 });
  p.plays++;
  p.at = Date.now();
  today();
  save();
}

/** A round of a skit was finished. Round 1 finished = the skit counts as done (for unlocking levels). */
export function finishSkit(id, round) {
  const p = (state.skits[id] ??= { plays: 1, done: 0, rounds: 0 });
  p.done++;
  p.rounds = Math.max(p.rounds ?? 0, round);
  p.at = Date.now();
  today().skits++;
  save();
}

// ───────────────────────── phrases & review ─────────────────────────

/** A phrase the learner said out loud, in the line where they said it. Schedules its first review. */
export function learnPhrase(skit, phrase, line) {
  const k = `${skit}|${phrase.es}`;
  const p = (state.phrases[k] ??= { es: phrase.es, en: phrase.en, skit, line, at: Date.now(), said: 0, ...firstSchedule() });
  p.said++;
  p.line = line;
  save();
}
export const phrases = () => Object.values(state.phrases).sort((a, b) => b.at - a.at);
export const duePhrases = (limit = 6) => dueItems(Object.values(state.phrases), localDay(), limit);

export function reviewPhrase(skit, es, ok) {
  const k = `${skit}|${es}`;
  if (!state.phrases[k]) return;
  state.phrases[k] = reviewed(state.phrases[k], ok);
  today().reviews++;
  save();
}

// ───────────────────────── backup ─────────────────────────

export function exportData() {
  state.lastBackup = Date.now();
  save();
  return JSON.stringify({ app: "skit-spanish", version: 2, exported: new Date().toISOString(), ...state }, null, 2);
}

/** When the learner last downloaded a backup (ms), or null. */
export const lastBackup = () => state.lastBackup ?? null;

/**
 * Upload a backup. It's merged with what's already here, so moving between devices never loses
 * practice from either one: best rounds, every day used, every word and phrase (the later review
 * schedule wins). Settings stay as they are on this device. Returns a short summary.
 */
export function importData(json) {
  let s;
  try { s = JSON.parse(json); } catch { throw new Error("That file isn’t a Skit Spanish backup (it couldn’t be read)."); }
  if (!s || typeof s.skits !== "object") throw new Error("That file doesn’t look like a Skit Spanish backup.");
  const incoming = migrate({ ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } });
  const before = stats();
  state = mergeStates(state, incoming);
  save();
  if (!saveOk) throw new Error("This browser won’t save data (private browsing?). Your progress can’t be kept here.");
  const after = stats();
  return { days: after.daysUsed - before.daysUsed, words: after.words - before.words, phrases: after.phrases - before.phrases, rounds: after.roundsDone - before.roundsDone };
}

/** Combine two saves (pure). a's settings are kept. */
export function mergeStates(a, b) {
  const out = structuredClone(a);
  for (const [id, p] of Object.entries(b.skits ?? {})) {
    const q = out.skits[id];
    out.skits[id] = !q ? { ...p } : {
      plays: Math.max(q.plays ?? 0, p.plays ?? 0), done: Math.max(q.done ?? 0, p.done ?? 0),
      rounds: Math.max(q.rounds ?? 0, p.rounds ?? 0), at: Math.max(q.at ?? 0, p.at ?? 0),
    };
  }
  for (const [day, d] of Object.entries(b.days ?? {})) {
    const e = out.days[day];
    // The same day on two devices: the bigger count per field (we can't tell if they overlap).
    out.days[day] = !e ? { ...d } : Object.fromEntries([...new Set([...Object.keys(e), ...Object.keys(d)])].map((k) => [k, Math.max(e[k] ?? 0, d[k] ?? 0)]));
  }
  for (const [w, e] of Object.entries(b.words ?? {})) {
    const f = out.words[w];
    out.words[w] = !f ? { ...e } : { n: Math.max(f.n, e.n), first: Math.min(f.first, e.first) };
  }
  for (const [k, p] of Object.entries(b.phrases ?? {})) {
    const q = out.phrases[k];
    if (!q) { out.phrases[k] = { ...p }; continue; }
    // Keep the copy that was reviewed more recently (higher review count, then later due date).
    const newer = (p.reviews ?? 0) > (q.reviews ?? 0) || ((p.reviews ?? 0) === (q.reviews ?? 0) && (p.due ?? "") > (q.due ?? ""));
    out.phrases[k] = { ...(newer ? p : q), said: Math.max(q.said ?? 0, p.said ?? 0), at: Math.min(q.at ?? Infinity, p.at ?? Infinity) };
  }
  out.lastBackup = Math.max(a.lastBackup ?? 0, b.lastBackup ?? 0) || undefined;
  return out;
}

export function resetProgress() { state.skits = {}; state.phrases = {}; state.words = {}; state.days = {}; save(); }
