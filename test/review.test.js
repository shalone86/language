import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReview, phrasesIn, meVoice } from "../public/js/review.js";
import { SKITS, skitById, lineOptions } from "../public/js/data/skits.js";
import { scoreLine } from "../public/js/score.js";
import { saidPhrase } from "../public/js/progress.js";

test("a review is scene → the line before → your line, per phrase", () => {
  const r = buildReview([
    { skit: "taqueria", es: "con todo", line: "Sí, con todo." },
    { skit: "que-onda", es: "¡Va!", line: "¡Va! ¿A qué hora?" },
  ]);
  assert.deepEqual(r.lines.map((l) => l.who), ["scene", "taqueria:chuy", "me", "scene", "que-onda:memo", "me"]);
  assert.equal(r.lines[1].es, "¿Con todo?");
  assert.equal(r.lines[2].es, "Sí, con todo.");
  assert.equal(r.lines[2].phrase.es, "con todo");
  assert.equal(r.lines[5].es, "¡Va! ¿A qué hora?"); // the choice that holds the phrase
  assert.ok(r.cast["taqueria:chuy"].voice);
});

test("phrases that left the skits are skipped, not crashed on", () => {
  const r = buildReview([{ skit: "gone", es: "x" }, { skit: "taqueria", es: "nope" }]);
  assert.equal(r.lines.length, 0);
});

test("every phrase in every skit can be reviewed, and its line passes its own review", () => {
  for (const s of SKITS) {
    for (const p of s.phrases) {
      const line = s.lines.find((l) => l.who === "me" && lineOptions(l).some((o) => phrasesIn(o, s).includes(p)));
      if (!line) continue; // phrases only the other person says are learned by listening
      const r = buildReview([{ skit: s.id, es: p.es, line: lineOptions(line)[0] }]);
      const me = r.lines.find((l) => l.who === "me");
      assert.ok(me, `${s.id}: ${p.es}`);
      assert.ok(saidPhrase(me.es, p), `${s.id}: “${me.es}” should contain “${p.es}”`);
      assert.equal(scoreLine([me.es], me.es).result, "great");
    }
  }
});

test("the learner's model voice differs from the cast", () => {
  const s = skitById("taqueria");
  assert.ok(!Object.values(s.cast).some((c) => c.voice === meVoice(s)));
});
