// Settings and progress, kept in this browser's localStorage, plus an online copy under a save
// code (sync.js). Same design as Skit Spanish; the rules live in progress.js.

import { localDay, streakStats, reviewed, firstSchedule, dueItems } from "./progress.js";

const KEY = "skit-stocks:v1";

const DEFAULTS = {
  settings: {
    speak: true, // read the characters' lines aloud
    ttsSource: "auto", // auto | server | browser
    browserVoice: "",
    passcode: "",
    unlockAll: false,
    sounds: true,
  },
  skits: {}, // id → { plays, done, rounds (0–3), at }
  terms: {}, // "skitId|term" → { t, def, skit, at, used, box, due, reviews, misses }
  days: {}, // "YYYY-MM-DD" → { answered, correct, skits, reviews }
  cloud: {}, // { code, savedAt, shown }
};

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return migrate({ ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } });
  } catch { /* private mode or corrupted — fall through */ }
  return structuredClone(DEFAULTS);
}

function migrate(s) {
  for (const p of Object.values(s.skits)) p.rounds ??= p.done ? 1 : 0;
  for (const t of Object.values(s.terms)) if (!t.due) Object.assign(t, firstSchedule(localDay(new Date(t.at || Date.now()))));
  return s;
}

let saveOk = true;
const listeners = new Set();
function save(quiet = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveOk = true; } catch { saveOk = false; }
  if (!quiet) for (const fn of listeners) { try { fn(); } catch { /* never break saving */ } }
}
export function onSave(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ───────────────────────── online copy (save code) ─────────────────────────

export const cloud = () => state.cloud ?? (state.cloud = {});
export function setCloud(patch) { state.cloud = { ...cloud(), ...patch }; save(true); }
export const hasProgress = () => Object.keys(state.days).length > 0 || Object.keys(state.skits).length > 0 || Object.keys(state.terms).length > 0;
export function snapshot() {
  const { settings: _s, cloud: _c, ...rest } = state;
  return JSON.stringify({ app: "skit-stocks", version: 1, ...rest });
}
export function mergeIn(json) {
  const s = JSON.parse(json);
  if (!s || typeof s.skits !== "object") return false;
  const incoming = migrate({ ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings } });
  const before = JSON.stringify([state.skits, state.days, state.terms]);
  state = mergeStates(state, incoming);
  const changed = before !== JSON.stringify([state.skits, state.days, state.terms]);
  save(true);
  return changed;
}

export function storageWorks() {
  try {
    const k = `${KEY}:probe`;
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok && saveOk;
  } catch { return false; }
}
export async function askToKeepData() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

// ───────────────────────── activity ─────────────────────────

function today() {
  return (state.days[localDay()] ??= { answered: 0, correct: 0, skits: 0, reviews: 0 });
}
export function markActive() { today(); save(); }

/** One answered question (first try only counts toward accuracy). */
export function recordAnswer({ correct = false } = {}) {
  const d = today();
  d.answered++;
  if (correct) d.correct++;
  save();
}

export function stats() {
  const s = streakStats(Object.keys(state.days));
  const totals = Object.values(state.days).reduce((a, d) => ({ answered: a.answered + (d.answered ?? 0), correct: a.correct + (d.correct ?? 0) }), { answered: 0, correct: 0 });
  return {
    ...s,
    ...totals,
    accuracy: totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null,
    terms: Object.keys(state.terms).length,
    skitsDone: Object.values(state.skits).filter((p) => p.done).length,
    roundsDone: Object.values(state.skits).reduce((a, p) => a + (p.rounds ?? 0), 0),
    due: dueItems(Object.values(state.terms), localDay(), Infinity).length,
  };
}
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

export function finishSkit(id, round) {
  const p = (state.skits[id] ??= { plays: 1, done: 0, rounds: 0 });
  p.done++;
  p.rounds = Math.max(p.rounds ?? 0, round);
  p.at = Date.now();
  today().skits++;
  save();
}

// ───────────────────────── terms & review ─────────────────────────

/** A term answered correctly in a skit. Schedules its first review. */
export function learnTerm(skit, term) {
  const k = `${skit}|${term.t}`;
  const t = (state.terms[k] ??= { t: term.t, def: term.def, skit, at: Date.now(), used: 0, ...firstSchedule() });
  t.used++;
  t.def = term.def;
  save();
}
export const terms = () => Object.values(state.terms).sort((a, b) => b.at - a.at);
export const dueTerms = (limit = 8) => dueItems(Object.values(state.terms), localDay(), limit);

export function reviewTerm(skit, t, ok) {
  const k = `${skit}|${t}`;
  if (!state.terms[k]) return;
  state.terms[k] = reviewed(state.terms[k], ok);
  today().reviews++;
  save();
}

// ───────────────────────── backup ─────────────────────────

export function exportData() {
  state.lastBackup = Date.now();
  save();
  return JSON.stringify({ app: "skit-stocks", version: 1, exported: new Date().toISOString(), ...state }, null, 2);
}
export const lastBackup = () => state.lastBackup ?? null;

export function importData(json) {
  let s;
  try { s = JSON.parse(json); } catch { throw new Error("That file isn’t a Skit Stocks backup (it couldn’t be read)."); }
  if (!s || typeof s.skits !== "object") throw new Error("That file doesn’t look like a Skit Stocks backup.");
  const incoming = migrate({ ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } });
  const before = stats();
  state = mergeStates(state, incoming);
  save();
  if (!saveOk) throw new Error("This browser won’t save data (private browsing?). Your progress can’t be kept here.");
  const after = stats();
  return { days: after.daysUsed - before.daysUsed, terms: after.terms - before.terms, rounds: after.roundsDone - before.roundsDone };
}

/** Combine two saves (pure). a's settings are kept. */
export function mergeStates(a, b) {
  const out = structuredClone(a);
  for (const [id, p] of Object.entries(b.skits ?? {})) {
    const q = out.skits[id];
    out.skits[id] = !q ? { ...p } : {
      plays: Math.max(q.plays ?? 0, p.plays ?? 0), done: Math.max(q.done ?? 0, p.done ?? 0),
      rounds: Math.max(q.rounds ?? 0, p.rounds ?? 0), ...(q.at || p.at ? { at: Math.max(q.at ?? 0, p.at ?? 0) } : {}),
    };
  }
  for (const [day, d] of Object.entries(b.days ?? {})) {
    const e = out.days[day];
    out.days[day] = !e ? { ...d } : Object.fromEntries([...new Set([...Object.keys(e), ...Object.keys(d)])].map((k) => [k, Math.max(e[k] ?? 0, d[k] ?? 0)]));
  }
  for (const [k, p] of Object.entries(b.terms ?? {})) {
    const q = out.terms[k];
    if (!q) { out.terms[k] = { ...p }; continue; }
    const newer = (p.reviews ?? 0) > (q.reviews ?? 0) || ((p.reviews ?? 0) === (q.reviews ?? 0) && (p.due ?? "") > (q.due ?? ""));
    out.terms[k] = { ...(newer ? p : q), used: Math.max(q.used ?? 0, p.used ?? 0), at: Math.min(q.at ?? Infinity, p.at ?? Infinity) };
  }
  out.lastBackup = Math.max(a.lastBackup ?? 0, b.lastBackup ?? 0) || undefined;
  if (!out.cloud?.code && b.cloud?.code) out.cloud = { ...b.cloud };
  return out;
}

export function resetProgress() { state.skits = {}; state.terms = {}; state.days = {}; state.cloud = {}; save(true); }
