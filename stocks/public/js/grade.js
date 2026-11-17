// Checking answers: filled-in terms, numbers, and a keyword fallback for explanations
// (used only when the AI meaning check can't be reached). Pure functions, unit-tested.

/** Lowercase, drop punctuation and accents, collapse spaces. "Stop-Loss!" → "stop loss" */
export function norm(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`]/g, "").replace(/[^a-z0-9.%$]+/g, " ").replace(/\s+/g, " ").trim();
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/**
 * Does a typed answer match one of the accepted answers? Forgiving about case, hyphens,
 * a small typo in longer words, and extra words around it ("it's a limit order" → "limit").
 */
export function matchFill(input, answers) {
  const got = norm(input);
  if (!got) return false;
  return answers.some((a) => {
    const want = norm(a);
    if (got === want || got.replace(/ /g, "") === want.replace(/ /g, "")) return true;
    if (` ${got} `.includes(` ${want} `)) return true;
    return want.length >= 5 && levenshtein(got, want) <= (want.length >= 9 ? 2 : 1);
  });
}

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mil: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/**
 * Read a number from what was typed or said: "$2,000", "about 2k", "20 billion", "9 years", "4%".
 * Returns { value, scale } (scale = the multiplier word, if any) or null.
 */
export function parseNumber(input) {
  const s = String(input ?? "").toLowerCase().replace(/,/g, "");
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*(k|thousand|m|million|mil|bn|b|billion)?\b/);
  if (!m) return WORDS[s.trim()] != null ? { value: WORDS[s.trim()], scale: 1 } : null;
  return { value: parseFloat(m[1]), scale: m[2] ? SCALE[m[2]] : 1 };
}
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, fifty: 50, hundred: 100 };

/**
 * Is the number right? tol is relative (0.03 = within 3%). An answer stated in billions
 * accepts "20", "20 billion" or "20000000000".
 */
export function checkNumber(input, { answer, tol = 0.01, suffix = "" }) {
  const p = parseNumber(input);
  if (!p) return { ok: false, value: null };
  const unit = /billion/.test(suffix) ? 1e9 : /million/.test(suffix) ? 1e6 : 1;
  let v = p.value * p.scale;
  if (unit > 1) v = p.scale > 1 || Math.abs(v) >= unit / 10 ? v / unit : v; // "20 billion" / "20000000000" → 20
  const ok = Math.abs(v - answer) <= Math.max(Math.abs(answer) * tol, 1e-9);
  return { ok, value: v };
}

/**
 * Keyword fallback for explanations: each group is a list of alternatives; a group counts if any
 * alternative appears. Passes when at least half the groups are covered (rounded up).
 */
export function keywordCheck(input, keys = []) {
  const text = ` ${norm(input)} `;
  const hit = keys.map((group) => group.some((k) => text.includes(` ${norm(k)} `) || (norm(k).length > 4 && text.includes(norm(k)))));
  const n = hit.filter(Boolean).length;
  return { ok: keys.length > 0 && n >= Math.ceil(keys.length / 2), covered: n, total: keys.length };
}

/** What a turn asks for in a given round (1 pick, 2 fill, 3 explain), falling back sensibly. */
export function modeFor(turn, round) {
  if (turn.chart && turn.target) return "chart";
  if (turn.number) return round === 3 && turn.explain ? "explain" : "number";
  if (round === 3 && turn.explain) return "explain";
  if (round >= 2 && turn.fill) return "fill";
  if (turn.choices) return "choice";
  if (turn.fill) return "fill";
  return turn.explain ? "explain" : "choice";
}

const shuffled = (a, rand) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * A review quiz for terms: alternate "what does this term mean?" and "which term is this?",
 * with two other terms as the wrong options.
 */
export function buildQuiz(items, pool, rand = Math.random) {
  return items.map((it, k) => {
    const others = shuffled(pool.filter((p) => p.t !== it.t && p.def !== it.def), rand).slice(0, 2);
    const askDef = k % 2 === 0;
    const right = askDef ? it.def : it.t;
    const options = shuffled([right, ...others.map((o) => (askDef ? o.def : o.t))], rand);
    return { it, prompt: askDef ? `What does “${it.t}” mean?` : `Which term is this? “${it.def}”`, options, right };
  });
}
