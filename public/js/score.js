// Compare what the speech recognizer heard with the line the learner was trying to say.
// Pure functions (no DOM) so they can be unit-tested in Node.
//
// The word-by-word alignment is the articulation app's scoreSentence; what's new here is
// Spanish normalization (accents, ñ, numbers, slang spellings) and tips for the sounds
// English speakers find hardest (rr, ñ, pure vowels).

// Spanish numbers, accents already stripped (we compare without accents).
const UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte",
  "veintiuno", "veintidos", "veintitres", "veinticuatro", "veinticinco", "veintiseis", "veintisiete", "veintiocho", "veintinueve"];
const TENS = { 3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa" };
const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function under1000(n) {
  if (n < 30) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${UNITS[n % 10]}` : "");
  if (n === 100) return "cien";
  return HUNDREDS[Math.floor(n / 100)] + (n % 100 ? ` ${under1000(n % 100)}` : "");
}

/** 75 → "setenta y cinco", 20000 → "veinte mil" (up to 999 999). */
export function numberToWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return String(n);
  if (n < 1000) return under1000(n);
  const th = Math.floor(n / 1000), r = n % 1000;
  return (th === 1 ? "mil" : `${under1000(th)} mil`) + (r ? ` ${under1000(r)}` : "");
}

// Different spellings of the same spoken word. Whisper (and people) write slang many ways.
const CANON = {
  wey: "guey", buey: "guey", guey: "guey", way: "guey",
  pa: "para", pal: "para el",
  pos: "pues", pus: "pues", ps: "pues",
  un: "uno", una: "uno",
  quihubo: "quiubo", quiobo: "quiubo", kiubo: "quiubo",
  cachay: "cachai", estay: "estai", vay: "vai",
  okey: "ok", oquei: "ok", okay: "ok",
  jangear: "janguear", hanguear: "janguear",
  orale: "orale", andale: "andale", andele: "andele",
};

// Multi-word spellings, fixed before splitting into words.
const PHRASE_CANON = [
  [/\bque hubo\b/g, "quiubo"], [/\bqui hubo\b/g, "quiubo"],
  [/\bno mas\b/g, "nomas"], [/\bsipo\b/g, "si po"], [/\bya po\b/g, "ya po"],
];

/** Lowercase, drop accents (but keep ñ), punctuation and apostrophes; spell out numbers. */
export function normalize(text) {
  let s = String(text ?? "").normalize("NFC").toLowerCase()
    .replace(/ñ/g, "\u0001")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\u0001/g, "ñ")
    .replace(/[’‘`']/g, "") // pa' → pa
    .replace(/(\d{1,3})[.,](\d{3})\b/g, "$1$2") // 20,000 / 20.000 → 20000
    .replace(/\d+/g, (n) => numberToWords(+n))
    .replace(/[^a-zñ0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of PHRASE_CANON) s = s.replace(re, to);
  return s;
}

const canon = (w) => CANON[w] ?? w;

export const tokens = (text) => {
  const n = normalize(text);
  return n ? n.split(" ").flatMap((w) => canon(w).split(" ")) : [];
};

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Things Whisper writes when it hears silence, noise or breathing (in Spanish mode).
const HALLUCINATIONS = new Set([
  "gracias", "muchas gracias", "gracias por ver", "gracias por ver el video", "suscribete",
  "subtitulos realizados por la comunidad de amara org", "subtitulado por la comunidad de amara org",
  "amara org", "musica", "aplausos", "risas", "ah", "eh", "mmm", "hmm",
]);

/** A word that's off by a letter or two. Not counted as right, but much better than a miss. */
const isClose = (t, h) => t.length >= 4 && levenshtein(t, h) <= (t.length >= 8 ? 2 : 1);

/**
 * Align an attempt with one target line, word by word.
 * @returns {{score:number, words:{word:string, status:"ok"|"close"|"missed"|"changed", heard?:string}[], extra:string[]}}
 *   score: 0..1 — ok words count 1, close words ½.
 */
export function scoreSentence(target, transcript) {
  const T = tokens(target);
  const H = tokens(transcript);
  const cost = (a, b) => (a === b ? 0 : isClose(a, b) ? 0.5 : 1);
  const n = T.length, m = H.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1]));

  const words = [];
  const extra = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1])) {
      const c = cost(T[i - 1], H[j - 1]);
      words.unshift(c === 0 ? { word: T[i - 1], status: "ok" }
        : { word: T[i - 1], status: c < 1 ? "close" : "changed", heard: H[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words.unshift({ word: T[i - 1], status: "missed" });
      i--;
    } else {
      extra.unshift(H[j - 1]);
      j--;
    }
  }
  const pts = words.reduce((s, w) => s + (w.status === "ok" ? 1 : w.status === "close" ? 0.5 : 0), 0);
  return { score: n ? pts / n : 0, words, extra };
}

// Encouraging on purpose: the goal is speaking out loud without fear, not perfection.
export const PASS = 0.75;
export const GREAT = 0.95;

/**
 * Score an attempt against a line. options: the acceptable versions (a line's text plus its
 * alts, or each choice of a "pick your reply" line). Returns the best match:
 * {result: "great"|"pass"|"try"|"nothing", score, words, extra, option, heard, tip?}
 */
export function scoreLine(options, transcript) {
  const heard = normalize(transcript);
  const opts = Array.isArray(options) ? options : [options];
  if (!heard || (HALLUCINATIONS.has(heard) && !opts.some((o) => normalize(o) === heard)))
    return { result: "nothing", score: 0, words: [], extra: [], option: 0, heard };
  let best = null;
  opts.forEach((o, option) => {
    const r = scoreSentence(o, transcript);
    if (!best || r.score > best.score) best = { ...r, option };
  });
  const result = best.score >= GREAT ? "great" : best.score >= PASS ? "pass" : "try";
  return { ...best, result, heard, tip: lineTip(best.words) };
}

export const isPass = (r) => r.result === "great" || r.result === "pass";

// Common English words that show up when the learner slips into English sounds
// (Whisper still writes them, even in Spanish mode).
const ENGLISH = new Set(["the", "say", "way", "may", "day", "no way", "see", "they", "though", "bay", "kay", "low", "toe", "bone", "pay", "soy", "say", "lay", "okay", "yes", "thanks"]);

/** Explain why one word didn't come through, in plain words. Returns {kind, message} or null. */
export function diagnose(target, heard) {
  const t = normalize(target), h = normalize(heard);
  if (!t || !h || t === h) return null;
  if (t.includes("rr") && h === t.replace(/rr/g, "r"))
    return { kind: "rr", message: `“${t}” came out as “${h}”. The double rr is a trill: let the tip of your tongue flutter behind your top teeth, like a motor. Pero (but) vs. perro (dog)!` };
  if (/^r/.test(t) && h === "d" + t.slice(1))
    return { kind: "r-start", message: "A Spanish r at the start of a word is trilled, like rr. Let your tongue flutter." };
  if (t.includes("ñ") && (h === t.replace(/ñ/g, "n") || h === t.replace(/ñ/g, "ni")))
    return { kind: "ñ", message: `The ñ sounded like a plain n. ñ is “ny” as in canyon: press the middle of your tongue to the roof of your mouth. (Año = year; ano is… not year.)` };
  if (ENGLISH.has(h))
    return { kind: "english", message: `That sounded like the English word “${h}”. Spanish vowels are short and pure, with no glide at the end: e = “eh”, o = “oh”.` };
  if (t.endsWith("s") && h === t.slice(0, -1))
    return { kind: "final-s", message: "The final s got lost. (Some Caribbean speakers do drop it, but say it clearly while you practice.)" };
  if (t.length === h.length && t.replace(/[aeiou]/g, "_") === h.replace(/[aeiou]/g, "_"))
    return { kind: "vowel", message: `A vowel changed (“${t}” → “${h}”). Spanish has five short, pure vowels: a “ah”, e “eh”, i “ee”, o “oh”, u “oo”. Keep each one crisp.` };
  return null;
}

/** The single most useful tip for a scored line (first word with a known pattern). */
export function lineTip(words) {
  for (const w of words) {
    if (w.status !== "changed" && w.status !== "close") continue;
    const d = diagnose(w.word, w.heard);
    if (d) return { ...d, word: w.word };
  }
  return null;
}

// A sound to listen for in a line, shown before the learner speaks. First match wins,
// ordered by how much each one trips up English speakers.
const SOUND_TIPS = [
  { sound: "rr", re: /rr|(^|\s)r/, tip: "rr (and r at the start of a word) is trilled: tongue tip flutters behind your top teeth." },
  { sound: "ñ", re: /ñ/, tip: "ñ = “ny” as in canyon." },
  { sound: "j", re: /j|g[ei]/, tip: "j (and g before e/i) is a breathy h from the back of the throat." },
  { sound: "gü", re: /gu[ei]/, raw: /gü/i, tip: "gü: say the u. Güey ≈ “gway”, and in fast speech just “way”." },
  { sound: "h", re: /(^|\s)h/, tip: "h is always silent: híjole = “EE-ho-leh”, hola = “OH-la”." },
  { sound: "r", re: /[aeiou]r[aeiou]/, tip: "A single r between vowels is a quick tap, like the tt in American “butter”." },
  { sound: "ll", re: /ll|(^|\s)y[aeiou]/, tip: "ll and y sound like the y in “yes” (in Argentina, closer to “sh”)." },
  { sound: "d", re: /[aeiou]d[aeiou]/, tip: "d between vowels is soft, almost the th in “this”: nada ≈ “NAH-tha”." },
  { sound: "v", re: /v/, tip: "v sounds like a soft b: vamos ≈ “BAH-mos”." },
];
const VOWEL_TIP = { sound: "vowels", tip: "Five short, pure vowels: a “ah”, e “eh”, i “ee”, o “oh”, u “oo”. No glide: no ≠ “now”." };

export function soundTip(text) {
  const n = normalize(text);
  for (const t of SOUND_TIPS) {
    if (t.raw ? t.raw.test(text) : t.re.test(n)) return t;
  }
  return VOWEL_TIP;
}

/** Accent-insensitive fold that keeps string length (so indexes map back to the original). */
export function fold(text) {
  return [...String(text)].map((c) => (c === "ñ" || c === "Ñ" ? "ñ" : c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() || c)).join("");
}
