// Little sound effects made with Web Audio (no files to download).

import { settings } from "./store.js";

let ctx;
function ac() {
  if (!settings().sounds) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, { at = 0, dur = 0.12, type = "sine", vol = 0.18, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// One sound for each kind of thing that happens.
export const sfx = {
  click: () => tone(880, { dur: 0.05, type: "triangle", vol: 0.08 }), // any ordinary button
  select: () => { tone(600, { dur: 0.06, type: "triangle", vol: 0.1 }); tone(900, { at: 0.05, dur: 0.06, type: "triangle", vol: 0.08 }); }, // a choice button
  toggle: () => { tone(500, { dur: 0.04, type: "square", vol: 0.04 }); tone(700, { at: 0.04, dur: 0.04, type: "square", vol: 0.04 }); },
  right: () => { tone(660, { dur: 0.1 }); tone(990, { at: 0.09, dur: 0.18 }); },
  oops: () => tone(220, { dur: 0.22, type: "triangle", vol: 0.14, slide: 0.8 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.22, type: "triangle", vol: 0.16 })),
};

/** Every button and link clicks, except ones that make their own sound (mark them data-own-sound). */
export function installClickSounds(skip = "[data-own-sound], .choice, [data-choice], [data-h], .rec") {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, a");
    if (!el || el.matches(skip) || el.disabled) return;
    sfx.click();
  }, true);
}
