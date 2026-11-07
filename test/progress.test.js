import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDay, addDays, daysBetween, streakStats, relativeDay, wordsOf,
  ROUNDS, nextRound, roundOpen, maskLine, INTERVALS, reviewed, firstSchedule, dueItems, saidPhrase,
} from "../public/js/progress.js";

test("days are local dates and add up across months and DST", () => {
  assert.equal(localDay(new Date(2026, 10, 7, 23, 59)), "2026-11-07");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-07", 2), "2026-03-09"); // US DST change
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2);
});

test("streaks: current run, longest run, days used, last day", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-07"];
  assert.deepEqual(streakStats(days, "2026-11-07"),
    { current: 3, longest: 3, daysUsed: 6, lastDay: "2026-11-07", practicedToday: true });
});

test("streak survives until the end of the next day", () => {
  const days = ["2026-11-05", "2026-11-06"];
  assert.equal(streakStats(days, "2026-11-07").current, 2); // not practiced yet today
  assert.equal(streakStats(days, "2026-11-07").practicedToday, false);
  assert.equal(streakStats(days, "2026-11-08").current, 0); // a whole day missed
  assert.equal(streakStats(days, "2026-11-08").longest, 2);
});

test("streak stats with no days, and duplicate or unsorted days", () => {
  assert.deepEqual(streakStats([], "2026-11-07"), { current: 0, longest: 0, daysUsed: 0, lastDay: null, practicedToday: false });
  const s = streakStats(["2026-11-07", "2026-11-06", "2026-11-07"], "2026-11-07");
  assert.equal(s.daysUsed, 2);
  assert.equal(s.current, 2);
});

test("last day used reads naturally", () => {
  assert.equal(relativeDay("2026-11-07", "2026-11-07"), "today");
  assert.equal(relativeDay("2026-11-06", "2026-11-07"), "yesterday");
  assert.equal(relativeDay("2026-11-03", "2026-11-07"), "4 days ago");
  assert.equal(relativeDay(null), "never");
});

test("words learned are counted once, slang spellings unified", () => {
  assert.deepEqual(wordsOf("¡Qué onda, güey! ¿Qué onda?"), ["que", "onda", "guey"]);
  assert.deepEqual(wordsOf("Wey"), ["guey"]);
});

test("rounds open one at a time and the next one is suggested", () => {
  assert.equal(ROUNDS.length, 3);
  assert.equal(nextRound(0), 1);
  assert.equal(nextRound(2), 3);
  assert.equal(nextRound(3), 3);
  assert.equal(roundOpen(2, 0), false);
  assert.equal(roundOpen(2, 1), true);
  assert.equal(roundOpen(3, 1), false);
});

const hidden = (pieces) => pieces.filter((p) => p.hidden).map((p) => p.text);
const words = (pieces) => pieces.filter((p) => /\S/.test(p.text));

test("round 2 hides about half the words, slang first", () => {
  const phrases = [{ es: "¡Órale!" }, { es: "pica un buen" }];
  const m = maskLine("¡Órale! Gracias. ¿Cuánto es?", phrases);
  assert.equal(m.map((p) => p.text).join(""), "¡Órale! Gracias. ¿Cuánto es?"); // nothing lost
  assert.equal(hidden(m).length, 2);
  assert.ok(hidden(m).includes("¡Órale!"), "the slang word is hidden");
});

test("round 2 masking covers every word of a multi-word phrase first", () => {
  const m = maskLine("Sí, con todo.", [{ es: "con todo" }]);
  assert.deepEqual(hidden(m), ["con", "todo."]);
});

test("masking is deterministic and never hides everything or nothing", () => {
  const line = "Aquí en la esquina está bien, gracias.";
  assert.deepEqual(maskLine(line, []), maskLine(line, []));
  const m = maskLine(line, []);
  assert.equal(hidden(m).length, Math.round(words(m).length / 2));
  assert.equal(hidden(maskLine("Sí.", [])).length, 1);
});

test("review schedule: right moves up a box, wrong goes back to box 1", () => {
  const today = "2026-11-07";
  const p = { es: "chido", ...firstSchedule(today) };
  assert.deepEqual(p, { es: "chido", box: 1, due: "2026-11-08" });
  const r1 = reviewed(p, true, "2026-11-08");
  assert.equal(r1.box, 2);
  assert.equal(r1.due, addDays("2026-11-08", INTERVALS[2]));
  const r2 = reviewed(r1, true, "2026-11-11");
  assert.equal(r2.box, 3);
  assert.equal(r2.due, "2026-11-18");
  const miss = reviewed(r2, false, "2026-11-18");
  assert.equal(miss.box, 1);
  assert.equal(miss.due, "2026-11-19");
  assert.equal(miss.reviews, 3);
  assert.equal(miss.misses, 1);
});

test("the top box stays the top box", () => {
  let p = { box: 1 };
  for (let i = 0; i < 20; i++) p = reviewed(p, true, "2026-11-07");
  assert.equal(p.box, INTERVALS.length - 1);
});

test("due items: only due ones, most overdue first, then lowest box", () => {
  const items = [
    { es: "a", due: "2026-11-07", box: 3 },
    { es: "b", due: "2026-11-01", box: 2 },
    { es: "c", due: "2026-11-09", box: 1 },
    { es: "d", due: "2026-11-07", box: 1 },
  ];
  assert.deepEqual(dueItems(items, "2026-11-07").map((p) => p.es), ["b", "d", "a"]);
  assert.deepEqual(dueItems(items, "2026-11-07", 1).map((p) => p.es), ["b"]);
});

test("a review answer must contain the phrase (any spelling)", () => {
  assert.ok(saidPhrase("¡Qué onda, wey!", { es: "güey", find: ["güey", "wey"] }));
  assert.ok(saidPhrase("bien o qué parce, qué hay para hacer", { es: "pa’", find: ["pa’"] }));
  assert.ok(saidPhrase("Me late, ahí nos vemos", { es: "¿Te late?", find: ["te late", "me late"] }));
  assert.ok(!saidPhrase("Sí, está bien", { es: "¡Órale!" }));
  assert.ok(!saidPhrase("ventana", { es: "va" })); // whole words only
});
