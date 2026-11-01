import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, tokens, numberToWords, scoreSentence, scoreLine, diagnose, soundTip, fold, isPass } from "../public/js/score.js";

test("normalize drops accents and punctuation but keeps ñ", () => {
  assert.equal(normalize("¡Órale! ¿Qué onda?"), "orale que onda");
  assert.equal(normalize("Año, MAÑANA"), "año mañana");
  assert.equal(normalize("pa’ hacer"), "pa hacer");
});

test("numbers are spelled out the Spanish way", () => {
  assert.equal(numberToWords(75), "setenta y cinco");
  assert.equal(numberToWords(32), "treinta y dos");
  assert.equal(numberToWords(20000), "veinte mil");
  assert.equal(numberToWords(8000), "ocho mil");
  assert.equal(numberToWords(100), "cien");
  assert.equal(numberToWords(150), "ciento cincuenta");
  assert.equal(normalize("Son 75 pesos"), "son setenta y cinco pesos");
  assert.equal(normalize("pongo 20,000"), "pongo veinte mil");
  assert.equal(normalize("pongo 20.000"), "pongo veinte mil");
});

test("slang spellings count as the same word", () => {
  assert.deepEqual(tokens("Qué onda, wey"), tokens("¿Qué onda, güey?"));
  assert.deepEqual(tokens("¿Qué hubo, parce?"), tokens("¡Quiubo, parce!"));
  assert.deepEqual(tokens("qué hay para hacer"), tokens("qué hay pa’ hacer"));
  assert.deepEqual(tokens("Sipo"), tokens("sí po"));
});

test("a perfect attempt is great", () => {
  const r = scoreLine(["Me da tres de pastor, por favor."], "Me da tres de pastor por favor");
  assert.equal(r.result, "great");
  assert.equal(r.score, 1);
});

test("one missed word in a long line still passes", () => {
  const r = scoreLine(["Aquí en la esquina está bien, gracias."], "Aquí en la esquina bien gracias");
  assert.ok(isPass(r));
  assert.equal(r.result, "pass");
});

test("a mostly wrong attempt is 'try' and shows what was heard", () => {
  const r = scoreLine(["¡Qué onda! Todo bien, ¿y tú?"], "Kevin todo");
  assert.equal(r.result, "try");
  assert.equal(r.heard, "kevin todo");
});

test("silence-ish hallucinations are 'nothing', unless that's the line", () => {
  assert.equal(scoreLine(["¡Órale! Gracias."], "Subtítulos realizados por la comunidad de Amara.org").result, "nothing");
  assert.equal(scoreLine(["¡Órale!"], "").result, "nothing");
  assert.equal(scoreLine(["Gracias."], "Gracias.").result, "great");
});

test("choices: the best-matching option wins", () => {
  const r = scoreLine(["Para aquí.", "Para llevar."], "para llevar");
  assert.equal(r.option, 1);
  assert.equal(r.result, "great");
});

test("close words count half and are marked", () => {
  const s = scoreSentence("Están bien ricos", "Están bien rico");
  assert.equal(s.words[2].status, "close");
  assert.ok(s.score > 0.8 && s.score < 1);
});

test("diagnose: rr → r, ñ → n, vowels, English", () => {
  assert.equal(diagnose("perro", "pero").kind, "rr");
  assert.equal(diagnose("año", "ano").kind, "ñ");
  assert.equal(diagnose("tengo", "tango").kind, "vowel");
  assert.equal(diagnose("sé", "say").kind, "english");
  assert.equal(diagnose("chelas", "chela").kind, "final-s");
  assert.equal(diagnose("chido", "chido"), null);
});

test("a tip comes back with a failed line", () => {
  const r = scoreLine(["Mi perro come mucho."], "mi pero come mucho");
  assert.equal(r.tip?.kind, "rr");
});

test("sound tips spot the hard sounds", () => {
  assert.equal(soundTip("Un perro").sound, "rr");
  assert.equal(soundTip("¿Qué onda, güey?").sound, "gü");
  assert.equal(soundTip("¡Híjole!").sound, "j");
  assert.equal(soundTip("Sí, con todo.").sound, "d");
  assert.equal(soundTip("Sí.").sound, "vowels");
});

test("fold keeps length so highlights map back", () => {
  for (const s of ["¿Qué onda, güey?", "Año", "Pásele, PÁSELE"]) assert.equal(fold(s).length, s.length);
  assert.equal(fold("Pásele"), "pasele");
  assert.equal(fold("AÑO"), "año");
});
