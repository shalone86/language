// Finding slang phrases in lines, and building a review session out of them.
// Pure (no DOM), so it's unit-tested in Node.

import { COUNTRIES, skitById, lineOptions } from "./data/skits.js";
import { fold } from "./score.js";

// Trim the punctuation around a phrase ("¿Neta?" → "Neta"); keep inner commas ("Ay, bendito").
const stripPunct = (s) => s.replace(/^[\s¿¡]+|[\s?!.…,]+$/g, "");
const isLetter = (c) => !!c && /[\p{L}]/u.test(c);

/** [start, end, phraseIndex] for every phrase of the skit found in text (accent-insensitive, whole words). */
export function phraseRanges(text, skit) {
  const f = fold(text);
  const ranges = [];
  skit.phrases.forEach((p, pi) => {
    for (const needle of p.find ?? [stripPunct(p.es)]) {
      const nf = fold(needle);
      let from = 0, idx;
      while (nf && (idx = f.indexOf(nf, from)) >= 0) {
        const end = idx + nf.length;
        if (!isLetter(f[idx - 1]) && !isLetter(f[end])) ranges.push([idx, end, pi]);
        from = end;
      }
    }
  });
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  for (const r of ranges) if (!out.length || r[0] >= out[out.length - 1][1]) out.push(r);
  return out;
}

export function phrasesIn(text, skit) {
  return [...new Set(phraseRanges(text, skit).map((r) => r[2]))].map((i) => skit.phrases[i]);
}

/** The voice used for "your" model lines: a voice from the same region not used by the cast. */
export function meVoice(skit) {
  const used = new Set(Object.values(skit.cast).map((c) => c.voice));
  const pool = skit.country === "mx" ? ["javier", "estrella", "sirio"] : skit.country === "co" ? ["celeste", "aquila", "selena"] : ["aquila", "selena"];
  return pool.find((v) => !used.has(v)) ?? pool[0];
}

/**
 * A review is a string of mini-scenes from different skits: a scene title, the line before,
 * then your line (played with no Spanish on screen). You must use the phrase being reviewed.
 * items: saved phrases { skit, es, line }. Returns a skit-shaped object the player can run.
 */
export function buildReview(items) {
  const cast = {}, phrases = [], lines = [];
  for (const it of items) {
    const skit = skitById(it.skit);
    const phrase = skit?.phrases.find((p) => p.es === it.es);
    if (!phrase) continue;
    const has = (o) => phrasesIn(o, skit).includes(phrase);
    // Prefer the learner line they said it in; otherwise the first learner line that has it.
    let at = skit.lines.findIndex((l) => l.who === "me" && lineOptions(l).includes(it.line) && lineOptions(l).some(has));
    if (at < 0) at = skit.lines.findIndex((l) => l.who === "me" && lineOptions(l).some(has));
    if (at < 0) continue;
    const me = skit.lines[at];
    const prev = skit.lines.slice(0, at).reverse().find((l) => l.who !== "me");
    lines.push({ who: "scene", es: `${COUNTRIES[skit.country].flag} ${skit.title}` });
    if (prev) {
      const key = `${skit.id}:${prev.who}`;
      cast[key] = skit.cast[prev.who];
      lines.push({ ...prev, who: key });
    }
    // A choice line: review the option that holds the phrase.
    const opt = me.choices ? me.choices.find((c) => has(c.es)) : me;
    lines.push({
      who: "me", es: opt.es, en: opt.en, alts: me.choices ? undefined : me.alts,
      src: skit.id, country: skit.country, voice: meVoice(skit), scene: skit.scene,
      phrase, hint: phrase.en.split(/[(—;]/)[0].trim(),
    });
    phrases.push({ ...phrase, country: skit.country, voice: Object.values(skit.cast)[0].voice });
  }
  return { id: "repaso", title: "Repaso", country: "mx", level: 1, scene: "", cast, phrases, lines };
}
