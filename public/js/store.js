// Settings and progress, kept in this browser's localStorage (same approach as articulation).

const KEY = "hablar:v1";

const DEFAULTS = {
  settings: {
    support: "auto", // auto (by level) | echo | read | recall
    handsFree: false, // start listening as soon as it's your turn
    slowAi: false, // the other characters talk slower
    showEn: false, // show English under every line
    ttsSource: "auto", // auto | server | browser
    browserVoice: "",
    passcode: "",
    unlockAll: false,
    sounds: true, // button and answer sound effects
  },
  skits: {}, // id → { plays, done, stars, at }
  phrases: {}, // "skitId|es" → { es, en, skit, line, at, said }
  streak: { day: "", count: 0 },
};

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return { ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
  } catch { /* private mode or corrupted — fall through */ }
  return structuredClone(DEFAULTS);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

export const skitProgress = (id) => state.skits[id] ?? { plays: 0, done: 0, stars: 0 };

export function startSkit(id) {
  const p = (state.skits[id] ??= { plays: 0, done: 0, stars: 0 });
  p.plays++;
  p.at = Date.now();
  save();
}

/** Record a finished skit. Keeps the best stars. */
export function finishSkit(id, stars) {
  const p = (state.skits[id] ??= { plays: 1, done: 0, stars: 0 });
  p.done++;
  p.stars = Math.max(p.stars, stars);
  p.at = Date.now();
  bumpStreak();
  save();
}

/** A phrase the learner said out loud, in the line where they said it. */
export function learnPhrase(skit, phrase, line) {
  const k = `${skit}|${phrase.es}`;
  const p = (state.phrases[k] ??= { es: phrase.es, en: phrase.en, skit, line, at: Date.now(), said: 0 });
  p.said++;
  p.line = line;
  save();
}
export const phrases = () => Object.values(state.phrases).sort((a, b) => b.at - a.at);

function today() { return new Date().toISOString().slice(0, 10); }
function bumpStreak() {
  const t = today();
  if (state.streak.day === t) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak = { day: t, count: state.streak.day === y ? state.streak.count + 1 : 1 };
}
export function streak() {
  const { day, count } = state.streak;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  return day === today() || day === y ? count : 0;
}

export function exportData() { return JSON.stringify(state, null, 2); }
export function importData(json) {
  const s = JSON.parse(json);
  if (!s || typeof s.skits !== "object") throw new Error("That file doesn’t look like a Hablar backup.");
  state = { ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
  save();
}
export function resetProgress() { state.skits = {}; state.phrases = {}; state.streak = { day: "", count: 0 }; save(); }
