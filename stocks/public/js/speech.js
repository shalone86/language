// Scoring spoken (or typed) lines, the Skit Spanish way: align what was heard with the line,
// word by word, then decide how much of it came through. Plus hiding key words for round 2.
// Pure functions, unit-tested.

const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "seventy two" → "72", "two thousand" → "2000", "five hundred" → "500". Words like "million" stay words. */
function wordsToDigits(words) {
  const out = [];
  let cur = null, total = 0;
  const flush = () => { if (cur !== null || total) out.push(String(total + (cur ?? 0))); cur = null; total = 0; };
  for (const w of words) {
    if (w in SMALL) { cur = (cur ?? 0) + SMALL[w]; continue; }
    if (w in TENS) { cur = (cur ?? 0) + TENS[w]; continue; }
    if (w === "hundred" && cur !== null) { cur *= 100; continue; }
    if (w === "thousand" && (cur !== null || total)) { total = (total + (cur ?? 1)) * 1000; cur = null; continue; }
    if (w === "and" && cur !== null) continue; // "one hundred and ten"
    flush();
    out.push(w);
  }
  flush();
  return out;
}

/** Lowercase words with money, percents and number words made comparable. "$1,100" = "eleven hundred"? close enough: = "1100". */
export function tokens(text) {
  const s = String(text ?? "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // 1,100 → 1100
    .replace(/(\d)\.0\b/g, "$1")
    .replace(/%/g, " percent ")
    .replace(/×/g, " times ").replace(/÷/g, " divided by ")
    .replace(/\b(\d+(?:\.\d+)?)k\b/g, (_, n) => String(+n * 1000))
    .replace(/(\w)'(\w)/g, "$1$2") // I'm → im, it's → its
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/(^|\s)\.|\.(\s|$)/g, " ")
    .split(/\s+/).filter(Boolean);
  return wordsToDigits(s).map((w) => (w === "percent" ? "percent" : w));
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Words that sound alike or that speech-to-text writes either way.
const SAME = [["ok", "okay"], ["etf", "etfs"], ["ipo", "ipos"], ["roth", "rothe", "ross"], ["sipc", "sipic", "sipec"], ["leaps", "leeps", "leap"], ["vs", "versus"], ["percent", "per", "cent"]];
const same = (a, b) => a === b || SAME.some((g) => g.includes(a) && g.includes(b));
const isClose = (t, h) => /^[a-z]+$/.test(t) && t.length >= 4 && levenshtein(t, h) <= (t.length >= 8 ? 2 : 1);

/** Align an attempt with a line, word by word. score: ok words count 1, close words ½. */
export function scoreSentence(target, transcript) {
  const T = tokens(target), H = tokens(transcript);
  const cost = (a, b) => (same(a, b) ? 0 : isClose(a, b) ? 0.5 : 1);
  const n = T.length, m = H.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1]));
  const words = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1])) {
      const c = cost(T[i - 1], H[j - 1]);
      words.unshift(c === 0 ? { word: T[i - 1], status: "ok" } : { word: T[i - 1], status: c < 1 ? "close" : "changed", heard: H[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words.unshift({ word: T[i - 1], status: "missed" }); i--;
    } else j--;
  }
  const pts = words.reduce((s, w) => s + (w.status === "ok" ? 1 : w.status === "close" ? 0.5 : 0), 0);
  return { score: n ? pts / n : 0, words };
}

// Encouraging on purpose, like Skit Spanish: getting most of the line out counts.
export const PASS = 0.75;
export const GREAT = 0.95;

// What speech-to-text writes for silence or noise.
const NOISE = new Set(["", "you", "thank you", "thanks for watching", "thank you for watching", "bye", "so", "um", "uh"]);

/** Score an attempt against a line. result: great | pass | try | nothing. */
export function scoreLine(target, transcript) {
  const heard = tokens(transcript).join(" ");
  if (NOISE.has(heard)) return { result: "nothing", score: 0, words: [], heard };
  const r = scoreSentence(target, transcript);
  return { ...r, heard, result: r.score >= GREAT ? "great" : r.score >= PASS ? "pass" : "try" };
}
export const isPass = (r) => r.result === "great" || r.result === "pass";

const STOP = new Set(["a", "an", "the", "and", "or", "but", "so", "i", "im", "ill", "id", "ive", "to", "in", "on", "of", "at", "by", "for", "it", "its", "is", "are", "was", "be", "my", "me", "we", "you", "your", "that", "this", "then", "than", "with", "up", "out", "there", "theres", "what", "do", "dont", "no", "not", "yes", "if", "as"]);

/**
 * Round 2: hide about half the words of a line, the key term's words first, then every other
 * word. Returns pieces [{ text, hidden }] (spaces are their own pieces), deterministic.
 */
export function maskLine(text, term = "", ratio = 0.5) {
  const parts = text.split(/(\s+)/).filter((p) => p !== "");
  const words = parts.map((p, i) => ({ i, p })).filter(({ p }) => /[A-Za-z0-9]/.test(p));
  const want = Math.max(1, Math.round(words.length * ratio));
  const termWords = new Set(tokens(term).filter((w) => w.length > 2 || /\d/.test(w)));
  const hide = new Set();
  for (const { i, p } of words) if (hide.size < want && tokens(p).some((w) => termWords.has(w) || [...termWords].some((t) => w.startsWith(t) && t.length > 3))) hide.add(i);
  // Then words that carry meaning (every other one), and only then the little words.
  const content = words.filter(({ i, p }) => !hide.has(i) && !tokens(p).every((w) => STOP.has(w)));
  for (let k = 0; k < content.length && hide.size < want; k += 2) hide.add(content[k].i);
  for (let k = 1; k < content.length && hide.size < want; k += 2) hide.add(content[k].i);
  for (const { i } of words) if (hide.size < want) hide.add(i);
  return parts.map((p, i) => ({ text: p, hidden: hide.has(i) }));
}

/**
 * What a turn asks for: "chart" (tap), "repeat" (round 1: say the line you see), "blanks"
 * (round 2: say it with key words hidden), or "free" (round 3: answer in your own words).
 */
export function turnMode(turn, round) {
  if (turn.chart && turn.target) return "chart";
  return round === 1 ? "repeat" : round === 2 ? "blanks" : "free";
}

/** Do we accept the learner's own wording (checked for meaning) instead of the exact line? */
export const acceptsOwnWords = (mode, level) => mode === "free" || (mode === "blanks" && level >= 3);

/** Does the AI say your line first? Round 1, in the early levels. */
export const echoes = (mode, level) => mode === "repeat" && level <= 2;
