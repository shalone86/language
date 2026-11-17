import { test, before } from "node:test";
import assert from "node:assert/strict";
import { SKITS, LEVELS, allTerms } from "../public/js/data/skits.js";
import { norm, matchFill, parseNumber, checkNumber, keywordCheck, modeFor, buildQuiz } from "../public/js/grade.js";
import { renderChart, hitTarget, goldenCross, rsi, sma, makeSeries } from "../public/js/chart.js";
import { cleanJudgeRequest, judgeMessages, parseJudge } from "../public/js/judge.js";
import worker from "../worker/index.js";

const VOICES = new Set(["orion", "thalia", "helena", "apollo", "arcas", "aries", "asteria", "athena", "luna", "zeus"]);

// ───────────────────────── lesson data ─────────────────────────

test("skits: unique ids, known levels, cast voices, enough turns", () => {
  const ids = new Set();
  for (const s of SKITS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id);
    assert.ok(LEVELS.some((L) => L.n === s.level), `${s.id}: level`);
    for (const k of ["title", "sub", "scene", "module"]) assert.ok(s[k], `${s.id}: ${k}`);
    for (const c of Object.values(s.cast)) assert.ok(VOICES.has(c.voice), `${s.id}: voice ${c.voice}`);
    const turns = s.lines.filter((l) => l.who === "me");
    assert.ok(turns.length >= 3, `${s.id}: only ${turns.length} turns`);
    for (const l of s.lines) assert.ok(l.who === "me" || (s.cast[l.who] && l.text), `${s.id}: bad line`);
  }
});

test("the course modules all have skits, in order", () => {
  const mods = SKITS.map((s) => s.module).filter((m) => m.startsWith("Module")).map((m) => +m.split(" ")[1]);
  for (let m = 1; m <= 7; m++) assert.ok(mods.includes(m), `Module ${m} has no skit`);
  assert.deepEqual(mods, [...mods].sort((a, b) => a - b), "modules out of order");
});

test("every level has enough skits to open the next", () => {
  for (const L of LEVELS.slice(1)) assert.ok(SKITS.filter((s) => s.level === L.n - 1).length >= L.unlockAfter);
});

test("every turn is answerable in all three rounds", () => {
  for (const s of SKITS) for (const t of s.lines.filter((l) => l.who === "me")) {
    for (const r of [1, 2, 3]) {
      const mode = modeFor(t, r);
      const ok = { choice: t.choices?.some((c) => c.ok), fill: t.fill?.answers?.length, number: t.number && Number.isFinite(t.number.answer), explain: t.explain?.model && t.explain?.keys?.length, chart: t.chart && t.target }[mode];
      assert.ok(ok, `${s.id} “${t.ask}” round ${r} (${mode}) can't be answered`);
    }
    if (t.choices) {
      assert.equal(t.choices.filter((c) => c.ok).length, 1, `${s.id} “${t.ask}”: needs exactly one right choice`);
      for (const c of t.choices) assert.ok(c.why, `${s.id}: every choice explains itself`);
    }
    if (t.fill) assert.equal(t.fill.text.split("___").length, 2, `${s.id}: fill needs one blank`);
    if (t.term) assert.ok(s.terms.some((x) => x.t === t.term), `${s.id}: term “${t.term}” isn't in the skit's terms`);
  }
});

test("every term is practiced by some turn in its skit", () => {
  for (const s of SKITS) for (const term of s.terms) {
    assert.ok(s.lines.some((l) => l.who === "me" && l.term === term.t), `${s.id}: term “${term.t}” is never practiced`);
  }
});

test("round 3 explanations pass their own model answer (keyword fallback)", () => {
  for (const s of SKITS) for (const t of s.lines.filter((l) => l.explain)) {
    assert.ok(keywordCheck(t.explain.model, t.explain.keys).ok, `${s.id}: model answer for “${t.explain.prompt}” fails its keywords`);
  }
});

// ───────────────────────── grading ─────────────────────────

test("fill answers forgive case, hyphens, extra words and a small typo", () => {
  assert.ok(matchFill("Limit", ["limit"]));
  assert.ok(matchFill("it's a limit order", ["limit"]));
  assert.ok(matchFill("stop loss", ["stop-loss"]));
  assert.ok(matchFill("diversifcation", ["diversification"]));
  assert.ok(matchFill("ex dividend", ["ex-dividend"]));
  assert.ok(!matchFill("market", ["limit"]));
  assert.ok(!matchFill("", ["limit"]));
  assert.equal(norm("Stop-Loss!"), "stop loss");
});

test("numbers: $, commas, words, k/billion, and tolerance", () => {
  assert.deepEqual(parseNumber("$2,000"), { value: 2000, scale: 1 });
  assert.equal(parseNumber("about 2k").value * parseNumber("about 2k").scale, 2000);
  assert.ok(checkNumber("$1,999", { answer: 2000, tol: 0.03 }).ok);
  assert.ok(checkNumber("2k", { answer: 2000, tol: 0.03 }).ok);
  assert.ok(!checkNumber("1500", { answer: 2000, tol: 0.03 }).ok);
  assert.ok(checkNumber("9 years", { answer: 9, tol: 0.06 }).ok);
  assert.ok(!checkNumber("8", { answer: 9, tol: 0.06 }).ok);
  assert.ok(checkNumber("nine", { answer: 9, tol: 0.06 }).ok);
  assert.ok(checkNumber("4%", { answer: 4, tol: 0.01, suffix: "%" }).ok);
  for (const v of ["20", "$20 billion", "20b", "20000000000"]) assert.ok(checkNumber(v, { answer: 20, tol: 0.02, suffix: " billion" }).ok, v);
  assert.ok(!checkNumber("hello", { answer: 20 }).ok);
});

test("keyword fallback needs about half the ideas", () => {
  const keys = [["inflation"], ["buying power", "buys less"], ["invest", "grow"]];
  assert.ok(keywordCheck("Inflation means your money buys less", keys).ok);
  assert.ok(!keywordCheck("savings are bad", keys).ok);
});

test("which question each round asks", () => {
  const t = { choices: [{ t: "a", ok: true, why: "x" }], fill: { text: "__", answers: ["a"] }, explain: { prompt: "p", keys: [["a"]], model: "a" } };
  assert.deepEqual([1, 2, 3].map((r) => modeFor(t, r)), ["choice", "fill", "explain"]);
  assert.deepEqual([1, 2, 3].map((r) => modeFor({ choices: t.choices }, r)), ["choice", "choice", "choice"]);
  assert.deepEqual([1, 2, 3].map((r) => modeFor({ number: { answer: 1 }, explain: t.explain }, r)), ["number", "number", "explain"]);
  assert.equal(modeFor({ chart: {}, target: { y: [1, 2] }, choices: t.choices }, 1), "chart");
});

test("review quiz: one right answer, two wrong ones from other terms", () => {
  const pool = allTerms();
  const quiz = buildQuiz(pool.slice(0, 4), pool);
  assert.equal(quiz.length, 4);
  for (const q of quiz) {
    assert.equal(q.options.length, 3);
    assert.equal(q.options.filter((o) => o === q.right).length, 1);
  }
  assert.match(quiz[0].prompt, /What does/);
  assert.match(quiz[1].prompt, /Which term/);
});

// ───────────────────────── charts ─────────────────────────

test("moving averages and RSI behave", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const up = Array.from({ length: 30 }, (_, i) => 10 + i);
  assert.equal(rsi(up)[29], 100);
  const series = makeSeries({ seed: 1, path: [[0, 10], [20, 20]], noise: 0.2 });
  assert.equal(series.length, 21);
  for (const c of series) assert.ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
});

test("every chart question has its answer on screen, and a tap there counts", () => {
  for (const s of SKITS) for (const t of s.lines.filter((l) => l.chart && l.target)) {
    const { closes, map } = renderChart(t.chart);
    if (t.target.x === "goldencross") {
      const c = goldenCross(closes);
      const from = closes.length - (t.chart.show ?? closes.length);
      assert.ok(c > from, `${s.id}: golden cross at ${c} is off screen (from ${from})`);
      assert.ok(hitTarget(t.target, { index: c, price: 0 }, closes));
    } else if (t.target.x === "rsi70") {
      const hits = rsi(closes).flatMap((v, i) => (v > 70 ? [i] : []));
      assert.ok(hits.length, `${s.id}: RSI never goes above 70`);
      assert.ok(hitTarget(t.target, { index: hits[0], price: 0 }, closes));
    } else if (t.target.y) {
      const mid = (t.target.y[0] + t.target.y[1]) / 2;
      assert.ok(hitTarget(t.target, { index: 0, price: mid }, closes));
      assert.ok(!hitTarget(t.target, { index: 0, price: t.target.y[1] + 5 }, closes));
    } else {
      const [a] = t.target.x[0];
      assert.ok(hitTarget(t.target, { index: a, price: 0 }, closes));
      assert.ok(!hitTarget(t.target, { index: 0, price: 0 }, closes) || t.target.x.some(([lo]) => lo === 0));
    }
    // A tap maps back to a candle and a price inside the chart.
    const p = map(200, 100);
    assert.ok(p.index >= 0 && p.index < closes.length && Number.isFinite(p.price));
  }
});

test("the double top really breaks its neckline inside the target candles", () => {
  const t = SKITS.find((s) => s.id === "patterns").lines.find((l) => l.target?.x && Array.isArray(l.target.x));
  const { closes } = renderChart(t.chart);
  const firstBelow = closes.findIndex((c, i) => i > 24 && c < 40.2);
  assert.ok(firstBelow >= t.target.x[0][0] && firstBelow <= t.target.x[0][1], `breaks at ${firstBelow}`);
});

// ───────────────────────── judge & worker ─────────────────────────

test("judge prompt and answers", () => {
  assert.equal(cleanJudgeRequest({ said: "  " }), null);
  const r = cleanJudgeRequest({ topic: "Inflation", question: "Why?", model: "Prices rise", keys: [["inflation"], ["buys less"]], said: "money buys less" });
  const [sys, user] = judgeMessages(r);
  assert.match(sys.content, /JSON/);
  assert.match(sys.content, /Never give investment advice/);
  assert.match(user.content, /Student answered: "money buys less"/);
  assert.deepEqual(parseJudge({ response: '{"ok": true, "note": "Yes!"}' }), { ok: true, note: "Yes!" });
  assert.equal(parseJudge({ response: "dunno" }), null);
  assert.equal(parseJudge({ response: '{"ok": false, "note": "you could add why"}' }).note, "You could add why");
});

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => m.set(k, v) }; };
const call = (env, method, path, body) => worker.fetch(new Request(`https://x${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });

test("worker: health, judge, and save codes", async () => {
  const env = { AI: { run: async () => ({ response: '{"ok": false, "note": "Mention inflation."}' }) }, PROGRESS: kv() };
  const h = await (await call(env, "GET", "/api/health")).json();
  assert.equal(h.judge, true);
  const j = await call(env, "POST", "/api/judge", { said: "savings are fine", question: "Why invest?" });
  assert.deepEqual(await j.json(), { ok: false, note: "Mention inflation." });
  const made = await (await call(env, "POST", "/api/progress", { skits: {}, days: {}, terms: {} })).json();
  assert.match(made.code, /^OSO-/);
  assert.equal((await call(env, "GET", `/api/progress/${made.code}`)).status, 200);
  assert.equal((await call({ ...env, APP_PASSCODE: "x" }, "GET", "/api/health")).status, 401);
});

// ───────────────────────── store ─────────────────────────

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let S;
before(async () => { S = await import("../public/js/store.js"); });

test("store: answers, accuracy, terms, rounds, and merging another device", () => {
  S.resetProgress();
  S.startSkit("orders");
  S.recordAnswer({ correct: true });
  S.recordAnswer({ correct: true });
  S.recordAnswer({ correct: false });
  S.learnTerm("orders", { t: "Limit order", def: "Your price or better." });
  S.learnTerm("orders", { t: "Limit order", def: "Your price or better." });
  S.finishSkit("orders", 1);
  let st = S.stats();
  assert.equal(st.daysUsed, 1);
  assert.equal(st.answered, 3);
  assert.equal(st.accuracy, 67);
  assert.equal(st.terms, 1);
  assert.equal(st.roundsDone, 1);
  assert.equal(S.dueTerms().length, 0); // first review is tomorrow

  const other = { skits: { orders: { plays: 2, done: 2, rounds: 3 } }, days: { "2026-01-02": { answered: 10, correct: 9 } }, terms: {} };
  const r = S.importData(JSON.stringify(other));
  assert.deepEqual(r, { days: 1, terms: 0, rounds: 2 });
  st = S.stats();
  assert.equal(st.answered, 13);
  assert.equal(S.skitProgress("orders").rounds, 3);
  assert.equal(JSON.parse(S.snapshot()).app, "skit-stocks");
});
