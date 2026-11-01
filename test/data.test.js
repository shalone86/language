import { test } from "node:test";
import assert from "node:assert/strict";
import { SKITS, LEVELS, COUNTRIES, lineOptions } from "../public/js/data/skits.js";
import { fold, tokens } from "../public/js/score.js";

const VOICES = new Set(["estrella", "sirio", "javier", "celeste", "selena", "aquila", "carina", "diana", "nestor", "alvaro"]);
const strip = (s) => s.replace(/^[\s¿¡]+|[\s?!.…,]+$/g, "");

test("skit ids are unique and every field is filled", () => {
  const ids = new Set();
  for (const s of SKITS) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.match(s.id, /^[\w-]+$/);
    assert.ok(COUNTRIES[s.country], `${s.id}: unknown country`);
    assert.ok(LEVELS.some((L) => L.n === s.level), `${s.id}: unknown level`);
    for (const k of ["title", "en", "scene"]) assert.ok(s[k], `${s.id}: missing ${k}`);
    assert.ok(s.phrases.length >= 4, `${s.id}: needs phrases`);
  }
});

test("every level has enough skits to unlock the next", () => {
  for (const L of LEVELS.slice(1)) {
    assert.ok(SKITS.filter((s) => s.level === L.n - 1).length >= L.unlockAfter, `level ${L.n - 1}`);
  }
});

test("cast voices exist and every line has a speaker", () => {
  for (const s of SKITS) {
    for (const c of Object.values(s.cast)) assert.ok(VOICES.has(c.voice), `${s.id}: voice ${c.voice}`);
    for (const l of s.lines) {
      assert.ok(l.who === "me" || s.cast[l.who], `${s.id}: unknown speaker ${l.who}`);
      if (l.choices) {
        assert.ok(l.choices.length >= 2 && l.choices.every((c) => c.es && c.en), `${s.id}: bad choices`);
      } else {
        assert.ok(l.es && l.en, `${s.id}: line missing es/en`);
      }
      for (const o of lineOptions(l)) assert.ok(tokens(o).length > 0, `${s.id}: empty line`);
    }
  }
});

test("skits alternate: the learner speaks several times, never twice in a row", () => {
  for (const s of SKITS) {
    const me = s.lines.filter((l) => l.who === "me").length;
    assert.ok(me >= 3, `${s.id}: only ${me} lines for the learner`);
    s.lines.forEach((l, i) => {
      if (i) assert.ok(!(l.who === "me" && s.lines[i - 1].who === "me"), `${s.id}: two learner lines in a row at ${i}`);
    });
  }
});

test("every phrase appears in its skit (so it's learned in context)", () => {
  for (const s of SKITS) {
    const text = fold(s.lines.flatMap((l) => (l.choices ? l.choices.map((c) => c.es) : [l.es])).join(" | "));
    for (const p of s.phrases) {
      const found = (p.find ?? [strip(p.es)]).some((f) => text.includes(fold(f)));
      assert.ok(found, `${s.id}: phrase “${p.es}” is not in any line`);
    }
  }
});

test("learner lines are short enough to say in one breath", () => {
  for (const s of SKITS)
    for (const l of s.lines.filter((x) => x.who === "me"))
      for (const o of lineOptions(l)) assert.ok(tokens(o).length <= 14, `${s.id}: “${o}” is long`);
});
