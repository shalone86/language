import { test, before } from "node:test";
import assert from "node:assert/strict";
import { localDay, addDays } from "../public/js/progress.js";

// A fake localStorage, with an old (v1) save in it to check migration.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const yesterday = addDays(localDay(), -1);
mem.set("hablar:v1", JSON.stringify({
  settings: { support: "echo" },
  skits: { taqueria: { plays: 2, done: 1, stars: 2 } },
  phrases: { "taqueria|con todo": { es: "con todo", en: "with everything", skit: "taqueria", line: "Sí, con todo.", at: Date.now() - 864e5, said: 1 } },
  streak: { day: yesterday, count: 3 },
}));
let S;
before(async () => { S = await import("../public/js/store.js"); });

test("old saves are migrated: streak days, rounds, review dates, words", () => {
  const st = S.stats();
  assert.equal(st.daysUsed, 3);
  assert.equal(st.current, 3);
  assert.equal(st.lastDay, yesterday);
  assert.equal(S.skitProgress("taqueria").rounds, 1);
  assert.equal(S.settings().echo, "on");
  assert.equal(S.settings().support, undefined);
  assert.ok(S.phrases()[0].due);
  assert.equal(st.words, 3); // si, con, todo
});

test("practicing today extends the streak and counts lines and minutes", () => {
  S.recordAttempt({ seconds: 3.2, passed: true });
  S.recordAttempt({ seconds: 2.8, passed: false });
  const st = S.stats();
  assert.equal(st.current, 4);
  assert.equal(st.practicedToday, true);
  assert.equal(st.daysUsed, 4);
  assert.equal(st.lastDay, localDay());
  assert.equal(st.lines, 2);
  assert.equal(st.passed, 1);
  assert.equal(st.seconds, 6);
});

test("words learned are distinct", () => {
  const before = S.stats().words;
  S.learnWords(["que", "onda", "guey"]);
  S.learnWords(["que", "onda"]);
  assert.equal(S.stats().words, before + 3);
});

test("rounds only go up; round 1 marks the skit done", () => {
  S.finishSkit("tiendita", 1);
  S.finishSkit("tiendita", 3);
  S.finishSkit("tiendita", 2);
  assert.equal(S.skitProgress("tiendita").rounds, 3);
  assert.equal(S.skitProgress("tiendita").done, 3);
});

test("a new phrase is due tomorrow; reviewing it moves it on", () => {
  S.learnPhrase("que-onda", { es: "¡Va!", en: "OK!" }, "¡Va! ¿A qué hora?");
  const p = S.phrases().find((x) => x.es === "¡Va!");
  assert.equal(p.box, 1);
  assert.equal(p.due, addDays(localDay(), 1));
  // The migrated phrase was learned yesterday, so it's due today.
  assert.deepEqual(S.duePhrases().map((x) => x.es), ["con todo"]);
  S.reviewPhrase("taqueria", "con todo", true);
  assert.equal(S.duePhrases().length, 0);
  assert.equal(S.phrases().find((x) => x.es === "con todo").box, 2);
});

test("backups round-trip", () => {
  const json = S.exportData();
  S.resetProgress();
  assert.equal(S.stats().daysUsed, 0);
  S.importData(json);
  assert.equal(S.stats().words > 0, true);
  assert.equal(S.skitProgress("tiendita").rounds, 3);
});

test("opening a skit or trying with nothing heard still counts as a day used", () => {
  S.resetProgress();
  S.startSkit("taqueria");
  assert.equal(S.stats().daysUsed, 1);
  assert.equal(S.stats().lines, 0); // nothing was heard, so no lines yet
  S.resetProgress();
  S.markActive();
  assert.equal(S.stats().practicedToday, true);
});

test("the probe says storage works here", () => {
  assert.equal(S.storageWorks(), true);
});

test("a download records when it happened and says what app it's from", () => {
  const before = Date.now();
  const file = JSON.parse(S.exportData());
  assert.equal(file.app, "hablar");
  assert.ok(S.lastBackup() >= before);
});

test("uploading merges with this device instead of replacing it", () => {
  S.resetProgress();
  // This device: round 1 of the taquería, practiced today, one word.
  S.finishSkit("taqueria", 1);
  S.learnWords(["chido"]);
  const here = JSON.parse(S.exportData());
  // The other device: round 3 of the taquería, round 1 of the tiendita, a day last week, other words.
  const other = structuredClone(here);
  other.skits = { taqueria: { plays: 5, done: 3, rounds: 3 }, tiendita: { plays: 1, done: 1, rounds: 1 } };
  other.days = { "2026-01-05": { lines: 9, passed: 7, seconds: 30, skits: 1, reviews: 0 } };
  other.words = { neta: { n: 2, first: 1 }, chido: { n: 4, first: 1 } };
  other.phrases = {};
  const r = S.importData(JSON.stringify(other));
  assert.deepEqual(r, { days: 1, words: 1, phrases: 0, rounds: 3 });
  assert.equal(S.skitProgress("taqueria").rounds, 3);
  assert.equal(S.skitProgress("tiendita").rounds, 1);
  const st = S.stats();
  assert.equal(st.daysUsed, 2); // today + the other device's day
  assert.equal(st.words, 2);
  assert.equal(st.lines, 9);
});

test("merging the same phrase keeps the more-reviewed schedule", () => {
  const a = { skits: {}, days: {}, words: {}, phrases: { "x|neta": { es: "neta", box: 1, due: "2026-11-14", reviews: 0, said: 1, at: 5 } } };
  const b = { skits: {}, days: { "2026-11-13": { lines: 2 } }, words: {}, phrases: { "x|neta": { es: "neta", box: 3, due: "2026-11-20", reviews: 2, said: 3, at: 9 } } };
  const m = S.mergeStates(a, b);
  assert.equal(m.phrases["x|neta"].box, 3);
  assert.equal(m.phrases["x|neta"].said, 3);
  assert.equal(m.phrases["x|neta"].at, 5);
  assert.equal(S.mergeStates(b, a).phrases["x|neta"].box, 3); // order doesn't matter
  // Same day on both devices: the bigger count, not the sum (they may be the same practice).
  const d = S.mergeStates({ ...a, days: { "2026-11-13": { lines: 5, seconds: 1 } } }, b).days["2026-11-13"];
  assert.deepEqual(d, { lines: 5, seconds: 1 });
});

test("uploading something that isn't a backup is refused with a clear message", () => {
  assert.throws(() => S.importData("not json"), /couldn’t be read/);
  assert.throws(() => S.importData('{"hello": 1}'), /doesn’t look like/);
});
