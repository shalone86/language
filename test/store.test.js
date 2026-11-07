import { test, before } from "node:test";
import assert from "node:assert/strict";
import { localDay, addDays } from "../public/js/progress.js";

// A fake localStorage, with an old (v1) save in it to check migration.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
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
