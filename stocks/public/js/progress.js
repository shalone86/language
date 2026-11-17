// Pure progress logic: days and streaks, the three rounds of a skit, hiding words,
// and the review schedule. No DOM and no storage, so it's all unit-tested in Node.


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

// ───────────────────────── rounds ─────────────────────────

// Every skit is played three times, with less help each time.
export const ROUNDS = [
  { n: 1, name: "Pick it", blurb: "Choose the right answer. Every option explains why it’s right or wrong." },
  { n: 2, name: "Fill it in", blurb: "No options: type the key word or number yourself." },
  { n: 3, name: "Say it your way", blurb: "Explain it in your own words, typed or spoken. Anything that shows you understand counts." },
];

/** The round to play next: the first not yet finished, or the last one if all are done. */
export function nextRound(roundsDone) {
  return Math.min(3, (roundsDone ?? 0) + 1);
}

/** Rounds open for a skit: round n opens when round n−1 is done. */
export const roundOpen = (n, roundsDone) => n <= nextRound(roundsDone);

// ───────────────────────── review schedule ─────────────────────────

// Days until a term comes back for review, by box (Leitner system).
// Box 1 = just learned or just missed; box 6 = known well (checked every two months).
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = INTERVALS.length - 1;

/** A phrase's schedule after a review. Right: up a box. Wrong: back to box 1, due tomorrow. */
export function reviewed(item, ok, today = localDay()) {
  const box = ok ? Math.min(MAX_BOX, (item.box ?? 1) + 1) : 1;
  return { ...item, box, due: addDays(today, INTERVALS[box]), reviews: (item.reviews ?? 0) + 1, misses: (item.misses ?? 0) + (ok ? 0 : 1) };
}

/** A term learned for the first time is due for review tomorrow. */
export const firstSchedule = (today = localDay()) => ({ box: 1, due: addDays(today, INTERVALS[1]) });

/** Terms due today or earlier, most overdue first, then lowest box. */
export function dueItems(items, today = localDay(), limit = 8) {
  return items
    .filter((p) => p.due && p.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : (a.box ?? 1) - (b.box ?? 1)))
    .slice(0, limit);
}

/** Browsers built into other apps (Messenger, Instagram, TikTok…) often throw saved data away. */
export const inAppBrowser = (ua = "") =>
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|MicroMessenger|Pinterest|LinkedInApp|GSA\//.test(ua);
