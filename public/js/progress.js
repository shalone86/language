// Pure progress logic: days and streaks, the three rounds of a skit, hiding words,
// and the review schedule. No DOM and no storage, so it's all unit-tested in Node.

import { fold, tokens } from "./score.js";

// ───────────────────────── days & streaks ─────────────────────────

/** "2026-11-07" in the learner's own time zone (not UTC: a late-night session counts for today). */
export function localDay(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add n days to a "YYYY-MM-DD" string (DST-safe: works at noon). */
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n, 12));
}

/** Whole days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 864e5);
}

/**
 * Stats from the set of days the app was used.
 * current: consecutive days ending today — or yesterday, so the streak isn't "lost"
 * before you've had a chance to practice today. longest: best run ever.
 */
export function streakStats(days, today = localDay()) {
  const list = [...new Set(days)].filter(Boolean).sort();
  if (!list.length) return { current: 0, longest: 0, daysUsed: 0, lastDay: null, practicedToday: false };
  let longest = 1, run = 1;
  for (let i = 1; i < list.length; i++) {
    run = daysBetween(list[i - 1], list[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = list[list.length - 1];
  const gap = daysBetween(last, today);
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = list.length - 1; i > 0 && daysBetween(list[i - 1], list[i]) === 1; i--) current++;
  }
  return { current, longest, daysUsed: list.length, lastDay: last, practicedToday: gap === 0 };
}

/** "today" / "yesterday" / "3 days ago" / a date, for the last day used. */
export function relativeDay(day, today = localDay()) {
  if (!day) return "never";
  const n = daysBetween(day, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n} days ago`;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: n > 300 ? "numeric" : undefined });
}

/** Distinct Spanish words in a line, normalized (accents off, slang spellings unified). */
export function wordsOf(text) {
  return [...new Set(tokens(text))].filter((w) => w.length > 1 || w === "y" || w === "o" || w === "a");
}

// ───────────────────────── rounds ─────────────────────────

// Every skit is played three times, with less written help each time.
export const ROUNDS = [
  { n: 1, name: "Con letra", en: "All the words", blurb: "Every word of your lines is shown." },
  { n: 2, name: "A medias", en: "Half the words", blurb: "Half the words of your lines are blanks — the slang first." },
  { n: 3, name: "Sin letra", en: "No words", blurb: "No Spanish on screen. Say it your way: anything that makes sense in the conversation counts." },
];

/** The round to play next: the first not yet finished, or the last one if all are done. */
export function nextRound(roundsDone) {
  return Math.min(3, (roundsDone ?? 0) + 1);
}

/** Rounds open for a skit: round n opens when round n−1 is done. */
export const roundOpen = (n, roundsDone) => n <= nextRound(roundsDone);

// ───────────────────────── hiding half the words ─────────────────────────

/**
 * Split a line into words and pick about half to hide. Words inside the skit's slang phrases
 * are hidden first (those are the ones worth recalling), then every other remaining word.
 * Deterministic, so the same blanks come back each time.
 * @returns {{text: string, hidden: boolean}[]} pieces in order; spaces are their own pieces.
 */
export function maskLine(text, phrases = [], ratio = 0.5) {
  const parts = text.split(/(\s+)/).filter((p) => p !== "");
  const words = parts.map((p, i) => ({ i, p })).filter(({ p }) => !/^\s+$/.test(p) && /[\p{L}\d]/u.test(p));
  const want = Math.max(1, Math.round(words.length * ratio));

  // Which words fall inside a phrase? Match on the folded text, per word.
  const folded = fold(text);
  const inPhrase = new Set();
  let at = 0;
  const spans = parts.map((p) => { const s = at; at += p.length; return [s, at]; });
  for (const ph of phrases) {
    for (const needle of ph.find ?? [ph.es.replace(/^[\s¿¡]+|[\s?!.…,]+$/g, "")]) {
      const nf = fold(needle);
      let from = 0, idx;
      while (nf && (idx = folded.indexOf(nf, from)) >= 0) {
        const end = idx + nf.length;
        if (!/\p{L}/u.test(folded[idx - 1] ?? "") && !/\p{L}/u.test(folded[end] ?? ""))
          words.forEach(({ i }) => { if (spans[i][0] < end && spans[i][1] > idx) inPhrase.add(i); });
        from = end;
      }
    }
  }

  const hide = new Set();
  for (const { i } of words) if (inPhrase.has(i) && hide.size < want) hide.add(i);
  // Then every other word that isn't hidden yet, starting with the second.
  const rest = words.filter(({ i }) => !hide.has(i));
  for (let k = 1; k < rest.length && hide.size < want; k += 2) hide.add(rest[k].i);
  for (let k = 0; k < rest.length && hide.size < want; k += 2) hide.add(rest[k].i);

  return parts.map((p, i) => ({ text: p, hidden: hide.has(i) }));
}

// ───────────────────────── review schedule ─────────────────────────

// Days until a phrase comes back for review, by box (Leitner system).
// Box 1 = just learned or just missed; box 6 = known well (checked every two months).
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = INTERVALS.length - 1;

/** A phrase's schedule after a review. Right: up a box. Wrong: back to box 1, due tomorrow. */
export function reviewed(item, ok, today = localDay()) {
  const box = ok ? Math.min(MAX_BOX, (item.box ?? 1) + 1) : 1;
  return { ...item, box, due: addDays(today, INTERVALS[box]), reviews: (item.reviews ?? 0) + 1, misses: (item.misses ?? 0) + (ok ? 0 : 1) };
}

/** A phrase said for the first time is due for review tomorrow. */
export const firstSchedule = (today = localDay()) => ({ box: 1, due: addDays(today, INTERVALS[1]) });

/** Phrases due today or earlier, most overdue first, then lowest box. */
export function dueItems(items, today = localDay(), limit = 8) {
  return items
    .filter((p) => p.due && p.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : (a.box ?? 1) - (b.box ?? 1)))
    .slice(0, limit);
}

/** Does what was heard contain the phrase (any of its spellings)? Used to check review answers. */
export function saidPhrase(heard, phrase) {
  const h = ` ${tokens(heard).join(" ")} `;
  return (phrase.find ?? [phrase.es]).some((f) => {
    const t = tokens(f).join(" ");
    return t && h.includes(` ${t} `);
  });
}
