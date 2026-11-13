// Skit Spanish by Polar World: practice everyday Spanish out loud in short skits with an AI partner.
// Plain ES modules, no build step (same setup as the articulation app).

import { SKITS, LEVELS, COUNTRIES, skitById, skitsInLevel, lineOptions } from "./data/skits.js";
import { Recorder, micSupported } from "./audio.js";
import { speak, stop, prefetch, playUrl, browserVoices } from "./tts.js";
import { health, transcribe, judge } from "./api.js";
import { scoreLine, isPass, soundTip, tokens as tokensOf } from "./score.js";
import { phraseRanges, phrasesIn, buildReview, meVoice } from "./review.js";
import { ROUNDS, nextRound, roundOpen, maskLine, relativeDay, localDay, addDays, saidPhrase, wordsOf } from "./progress.js";
import * as S from "./store.js";
import { sfx, installClickSounds } from "./sound.js";

const app = document.getElementById("app");
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Came through: the words matched, or (round 3, reviews) the reply made sense. */
const passed = (r) => isPass(r ?? {}) || r?.result === "sense";

// The app's main web address. Progress is stored per address, so other addresses get a notice.
const HOME_HOST = "hablar.shalonely.com";

// Without the meaning checker, round 3 accepts a reply that gets this much of the script line.
const LOOSE_PASS = 0.5;

// ───────────────────────── progress rules ─────────────────────────

export function levelUnlocked(n) {
  if (n <= 1 || S.settings().unlockAll) return true;
  if (!levelUnlocked(n - 1)) return false;
  const done = skitsInLevel(n - 1).filter((s) => S.skitProgress(s.id).done).length;
  return done >= LEVELS[n - 1].unlockAfter;
}

/** The skit the big "practice" button opens: the first never played, then the one with fewest rounds done. */
function nextSkit(after) {
  const open = SKITS.filter((s) => levelUnlocked(s.level));
  const from = after ? open.findIndex((s) => s.id === after) + 1 : 0;
  const rest = [...open.slice(from), ...open.slice(0, from)];
  const rounds = (s) => S.skitProgress(s.id).rounds ?? 0;
  return rest.find((s) => !rounds(s))
    ?? [...rest].filter((s) => s.id !== after && rounds(s) < 3).sort((a, b) => rounds(a) - rounds(b))[0]
    ?? rest.find((s) => s.id !== after) ?? open[0];
}

const roundsHtml = (n) => `<span class="rounds" aria-label="${n} of 3 rounds done">${[1, 2, 3].map((k) => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</span>`;

// ───────────────────────── router ─────────────────────────

const routes = [
  [/^$/, viewHome],
  [/^skit\/([\w-]+)$/, viewSkit],
  [/^repaso$/, viewReview],
  [/^progreso$/, viewProgress],
  [/^frases$/, viewPhrases],
  [/^ajustes$/, viewSettings],
];

function route() {
  leaveSkit();
  const path = location.hash.replace(/^#\/?/, "");
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (path.split("/")[0] || "home")));
      updateDueBadge();
      fn(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
}

function updateDueBadge() {
  const b = document.getElementById("due-badge");
  if (!b) return;
  const n = S.stats().due;
  b.hidden = !n;
  b.textContent = n > 9 ? "9+" : String(n);
}

function render(html) {
  app.innerHTML = html;
  document.body.classList.remove("in-skit");
}

function toast(msg, ms = 2600) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), ms);
}

function confetti(anchor) {
  sfx.win();
  const box = anchor?.getBoundingClientRect?.() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const colors = ["#e4007c", "#ffb703", "#00a6a6", "#ff5d3b", "#7b2cbf"];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.left = `${box.left + box.width / 2}px`;
    p.style.top = `${box.top + box.height / 2}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", `${(Math.random() - 0.5) * 260}px`);
    p.style.setProperty("--dy", `${-80 - Math.random() * 160}px`);
    p.style.setProperty("--r", `${Math.random() * 720}deg`);
    document.body.append(p);
    setTimeout(() => p.remove(), 1100);
  }
}

// ───────────────────────── home ─────────────────────────

function viewHome() {
  const next = nextSkit();
  const np = S.skitProgress(next.id);
  const st = S.stats();
  render(`
    <section class="hero">
      <img class="hero-logo" src="icon.svg" alt="" width="112" height="112">
      <p class="eyebrow">Skit Spanish · by Polar World</p>
      <h1>Habla sin miedo.</h1>
      <p class="lede">Real everyday scenes. The AI plays the other person, you play you. Say your lines out loud and the app tells you if they came through.</p>
      <a class="btn primary big" href="#/skit/${next.id}">▶ ${np.rounds ? `Ronda ${nextRound(np.rounds)}` : "Empezar"}: ${esc(next.title)} ${COUNTRIES[next.country].flag}</a>
      ${st.due ? `<p><a class="btn" href="#/repaso">🔁 Repaso: ${plural(st.due, "phrase")} to review</a></p>` : ""}
      <p class="stats">
        <a href="#/progreso">🔥 <b>${st.current}</b> day streak</a>
        <a href="#/progreso"><b>${st.words}</b> words</a>
        <a href="#/frases"><b>${st.phrases}</b> frases</a>
        <a href="#/progreso"><b>${st.roundsDone}</b>/${SKITS.length * 3} rounds</a>
      </p>
    </section>
    ${savingNotice()}
    ${micSupported() ? "" : `<p class="note warn">This browser can’t record audio. You can still listen to every skit; try Chrome, Edge or Safari to speak.</p>`}
    ${LEVELS.map(levelHtml).join("")}
  `);
}

function levelHtml(L) {
  const open = levelUnlocked(L.n);
  const skits = skitsInLevel(L.n);
  const prevDone = L.n > 1 ? skitsInLevel(L.n - 1).filter((s) => S.skitProgress(s.id).done).length : 0;
  return `
    <section class="level ${open ? "" : "locked"}" aria-labelledby="lv${L.n}">
      <div class="level-head">
        <span class="level-n">${L.n}</span>
        <div>
          <h2 id="lv${L.n}">${esc(L.name)} <small>${esc(L.en)}</small></h2>
          <p class="muted">${open ? esc(L.blurb) : `🔒 Finish ${plural(L.unlockAfter - prevDone, "more skit")} in level ${L.n - 1} to open this level.`}</p>
        </div>
      </div>
      <div class="skit-grid">
        ${skits.map((s) => {
          const p = S.skitProgress(s.id);
          const inner = `
            <span class="flag" aria-hidden="true">${COUNTRIES[s.country].flag}</span>
            <span class="skit-title">${esc(s.title)}</span>
            <span class="skit-en">${esc(s.en)} · ${COUNTRIES[s.country].name}</span>
            <span class="skit-meta">${p.rounds ? roundsHtml(p.rounds) : `<span class="tag">${s.phrases.length} frases</span>`}</span>`;
          return open
            ? `<a class="skit-card" href="#/skit/${s.id}">${inner}</a>`
            : `<div class="skit-card" aria-disabled="true">${inner}</div>`;
        }).join("")}
      </div>
    </section>`;
}

// ───────────────────────── skit intro ─────────────────────────

let P = null; // the skit (or review) being played

function leaveSkit() {
  if (!P) return;
  P.token = null;
  P.rec?.cancel();
  stop();
  P = null;
  closeSheet();
}

const voiceGender = (v) => (["sirio", "javier", "aquila", "nestor", "alvaro"].includes(v) ? "m" : "f");

/** Does the AI say your line first? Only in round 1 (later rounds are about recalling). */
function echoFor(skit, round) {
  if (round !== 1) return false;
  const e = S.settings().echo;
  return e === "on" || (e === "auto" && !!LEVELS[skit.level - 1].echo);
}

function viewSkit(id, chosen) {
  const skit = skitById(id);
  if (!skit) return (location.hash = "#/");
  if (!levelUnlocked(skit.level)) {
    render(`<p class="note">🔒 <b>${esc(skit.title)}</b> is in level ${skit.level}. Finish more skits in level ${skit.level - 1} first. <a href="#/">Back</a></p>`);
    return;
  }
  const L = LEVELS[skit.level - 1];
  const done = S.skitProgress(id).rounds ?? 0;
  const round = chosen && roundOpen(chosen, done) ? chosen : nextRound(done);
  const R = ROUNDS[round - 1];
  const set = S.settings();
  render(`
    <article class="intro">
      <a href="#/" class="back">← Skits</a>
      <p class="eyebrow">${COUNTRIES[skit.country].flag} ${COUNTRIES[skit.country].name} · Nivel ${skit.level} · ${esc(L.name)}</p>
      <h1>${esc(skit.title)}</h1>
      <p class="lede">${esc(skit.scene)}</p>
      <p class="cast">${Object.values(skit.cast).map((c) => `<span class="who">${esc(c.name)}</span>`).join(" ")} <span class="who me">Tú</span></p>

      <h2>Ronda <small>less help each time</small></h2>
      <div class="round-pick" role="group" aria-label="Choose a round">
        ${ROUNDS.map((r) => {
          const open = roundOpen(r.n, done);
          return `<button type="button" class="round-btn ${r.n === round ? "on" : ""}" data-round="${r.n}" ${open ? "" : "disabled"} aria-pressed="${r.n === round}">
            <b>${r.n <= done ? "✓" : open ? r.n : "🔒"} ${esc(r.name)}</b><span>${esc(r.en)}</span></button>`;
        }).join("")}
      </div>
      <div class="how">${round === 1
        ? echoFor(skit, 1) ? "👂 → 🎙️ You’ll hear each of your lines first. Then say it back." : "📖 → 🎙️ Read your line and say it. Tap 👂 if you want to hear it first."
        : round === 2 ? "🧩 → 🎙️ Half the words of your lines are blanks (the slang first). Say the whole line. Tap 👀 to peek."
        : "💭 → 🎙️ No Spanish on screen — just what you want to say, in English. Say it your way: anything that makes sense in the conversation counts."}</div>

      <h2>Frases de hoy <small>tap to hear</small></h2>
      <div class="chips">${skit.phrases.map((p, i) => `<button type="button" class="chip${p.spicy ? " spicy" : ""}" data-phrase="${i}">${esc(p.es)}</button>`).join("")}</div>
      <p class="muted small">${round === 1 ? "You’ll meet these in the conversation. No need to memorize them now." : "Try to use these — they’re what the blanks are hiding."}</p>
      <div class="toggles">
        <label><input type="checkbox" data-set="handsFree" ${set.handsFree ? "checked" : ""}> 🎙️ Listen automatically on my turn</label>
        <label><input type="checkbox" data-set="slowAi" ${set.slowAi ? "checked" : ""}> 🐢 Others talk slower</label>
        <label><input type="checkbox" data-set="showEn" ${set.showEn ? "checked" : ""}> 🇺🇸 Show English under lines</label>
      </div>
      <button class="btn primary big" id="start">▶ Empezar ronda ${round}</button>
    </article>`);
  bindToggles();
  app.querySelectorAll("[data-phrase]").forEach((b) => b.addEventListener("click", () => showPhrase(skit, +b.dataset.phrase)));
  app.querySelectorAll("[data-round]").forEach((b) => b.addEventListener("click", () => viewSkit(id, +b.dataset.round)));
  document.getElementById("start").addEventListener("click", () => startSkit(skit, round));
  const mv = meVoice(skit);
  prefetch(skit.lines.slice(0, 4).flatMap((l) => (l.who === "me" ? lineOptions(l).map((t) => [t, mv]) : [[l.es, skit.cast[l.who].voice]])));
}

function bindToggles() {
  app.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.set, el.checked)));
}

// ───────────────────────── the stage (skits and reviews) ─────────────────────────

function startSkit(skit, round = 1) {
  S.startSkit(skit.id);
  S.askToKeepData();
  const mv = meVoice(skit);
  P = {
    skit, level: LEVELS[skit.level - 1], round, echo: echoFor(skit, round), meVoice: mv,
    i: 0, firstTry: 0, meLines: skit.lines.filter((l) => l.who === "me").length,
    tries: 0, peeked: false, rec: null, take: null, result: null, busy: false, learned: new Set(),
    token: Symbol("skit"),
  };
  prefetch(skit.lines.flatMap((l) => (l.who === "me" ? lineOptions(l).map((t) => [t, mv]) : [[l.es, skit.cast[l.who].voice]])));
  openStage(`${skit.title}`, `${COUNTRIES[skit.country].flag} · Ronda ${round}`, `#/skit/${skit.id}`);
}

function openStage(title, sub, backHref) {
  render(`
    <div class="stage">
      <div class="stage-head">
        <a href="${backHref}" class="back" aria-label="Leave">✕</a>
        <div class="stage-title"><b>${esc(title)}</b> <span class="muted">${esc(sub)}</span></div>
        <div class="bar" aria-hidden="true"><i id="bar"></i></div>
      </div>
      <ol class="convo" id="convo" aria-live="polite"></ol>
      <div class="dock" id="dock"></div>
    </div>`);
  document.body.classList.add("in-skit");
  advance();
}

const aiRate = () => (P.level.rate ?? 1) * (S.settings().slowAi ? 0.8 : 1);

/** Play AI lines until it's the learner's turn (or the skit ends). */
async function advance() {
  const tok = P?.token;
  while (P && P.token === tok && P.i < P.skit.lines.length) {
    const line = P.skit.lines[P.i];
    updateBar();
    if (line.who === "scene") {
      appendScene(line);
      P.i++;
      continue;
    }
    if (line.who !== "me") {
      const li = appendAiBubble(line, P.i);
      renderDock("listen");
      li.classList.add("speaking");
      try { await sayAi(line); } catch (e) { toast(e.message); await sleep(1200); }
      li.classList.remove("speaking");
      if (!P || P.token !== tok) return;
      P.i++;
      await sleep(250);
      continue;
    }
    appendMyBubble(line, P.i);
    P.tries = 0; P.peeked = false; P.result = null; P.take = null; P.graded = false;
    renderDock();
    if (P.echo) {
      await modelSay(line).catch(() => {});
      if (!P || P.token !== tok) return;
    }
    if (S.settings().handsFree && micSupported()) toggleRec();
    return;
  }
  if (P && P.token === tok) (P.review ? finishReview() : finishSkit());
}

function sayAi(line) {
  const c = P.skit.cast[line.who];
  return speak(line.es, { voice: c.voice, gender: c.gender, rate: aiRate() });
}

const lineVoice = (line) => line.voice ?? P.meVoice;

/** Say the learner's line (or each choice) in the model voice. */
async function modelSay(line, { slow = false } = {}) {
  const tok = P.token;
  const texts = line.choices ? line.choices.map((c) => c.es) : [line.es];
  const v = lineVoice(line);
  for (const [k, t] of texts.entries()) {
    if (!P || P.token !== tok) return;
    highlightOption(k);
    await speak(t, { voice: v, gender: voiceGender(v), slow, rate: 0.95 });
    if (k < texts.length - 1) await sleep(350);
  }
  highlightOption(-1);
}

function highlightOption(k) {
  document.querySelectorAll("#convo .current .opt").forEach((o, i) => o.classList.toggle("playing", i === k));
}

function updateBar() {
  const bar = document.getElementById("bar");
  if (bar) bar.style.width = `${Math.round((P.i / P.skit.lines.length) * 100)}%`;
}

function scrollDown(el) {
  requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "end" }));
}

function appendScene(line) {
  const li = document.createElement("li");
  li.className = "scene";
  li.textContent = line.es;
  document.getElementById("convo").append(li);
}

function appendAiBubble(line) {
  const c = P.skit.cast[line.who];
  const li = document.createElement("li");
  li.className = "bubble them";
  li.innerHTML = `
    <span class="name">${esc(c.name)}</span>
    <p class="es">${highlight(line.es, P.skit)}</p>
    <p class="en" ${S.settings().showEn ? "" : "hidden"}>${esc(line.en)}</p>
    <span class="bubble-tools"><button type="button" class="mini" data-replay aria-label="Hear it again">🔁</button><button type="button" class="mini" data-en aria-label="Show English">EN</button></span>`;
  li.querySelector("[data-replay]").addEventListener("click", () => speak(line.es, { voice: c.voice, gender: c.gender, rate: aiRate() }).catch((e) => toast(e.message)));
  li.querySelector("[data-en]").addEventListener("click", () => { const en = li.querySelector(".en"); en.hidden = !en.hidden; });
  bindPhrases(li);
  document.getElementById("convo").append(li);
  scrollDown(li);
  return li;
}

/** Round 2: the line with about half its words as blanks (tap a blank to see it). */
function maskedHtml(text) {
  return maskLine(text, P.skit.phrases).map((piece) => piece.hidden
    ? `<button type="button" class="blank" data-word="${esc(piece.text)}" style="--w:${Math.max(2, piece.text.length)}ch" aria-label="hidden word, tap to show">${"_".repeat(Math.min(piece.text.length, 3))}</button>`
    : esc(piece.text)).join("");
}

function optionHtml(o, k) {
  if (P.round === 1)
    return `<div class="opt" data-opt="${k}"><p class="es">${highlight(o.es, P.skit)}</p><p class="en" ${S.settings().showEn ? "" : "hidden"}>${esc(o.en)}</p></div>`;
  if (P.round === 2)
    return `<div class="opt" data-opt="${k}"><p class="es masked">${maskedHtml(o.es)}</p><p class="cue small">“${esc(o.en)}”</p></div>`;
  return `<div class="opt" data-opt="${k}"><p class="cue">“${esc(o.en)}”</p><p class="es veiled" aria-hidden="true">${esc(o.es)}</p></div>`;
}

function appendMyBubble(line, idx) {
  const opts = line.choices ?? [{ es: line.es, en: line.en }];
  const li = document.createElement("li");
  li.className = `bubble me current round-${P.round}`;
  li.dataset.idx = idx;
  const label = line.choices ? ` <small>· say either one</small>` : P.round === 3 ? ` <small>· say it your way</small>` : "";
  li.innerHTML = `
    <span class="name">Tú${label}</span>
    ${line.hint ? `<p class="hint small">💬 Use the slang for <b>${esc(line.hint)}</b></p>` : ""}
    ${opts.map((o, k) => optionHtml(o, k)).join(line.choices ? `<span class="or">o</span>` : "")}`;
  bindPhrases(li);
  li.querySelectorAll(".blank").forEach((b) => b.addEventListener("click", () => {
    b.replaceWith(document.createTextNode(b.dataset.word));
    P.peeked = true;
  }));
  document.getElementById("convo").append(li);
  scrollDown(li);
}

function currentBubble() { return document.querySelector("#convo .current"); }

function peek() {
  P.peeked = true;
  const li = currentBubble();
  const line = P.skit.lines[P.i];
  const opts = line.choices ?? [{ es: line.es }];
  li?.querySelectorAll(".opt").forEach((o, k) => {
    const es = o.querySelector(".es");
    es.classList.remove("veiled", "masked");
    es.removeAttribute("aria-hidden");
    es.innerHTML = highlight(opts[k].es, P.skit);
  });
  bindPhrases(li);
  renderDock();
}

/** Show how the attempt came through, in the learner's bubble. */
function paintResult(r) {
  const li = currentBubble();
  if (!li) return;
  const line = P.skit.lines[P.i];
  if (r.result === "sense") {
    // Their own words made sense: show what they said, and the script line as one more way to say it.
    li.querySelectorAll(".opt").forEach((o) => o.classList.add("dim"));
    li.insertAdjacentHTML("beforeend", `<p class="es said">“${esc(r.heard)}”</p>`);
    li.classList.add("passed");
    return;
  }
  if (!r.words?.length) return;
  // Round 3 has no words on screen: a miss doesn't give the answer away (👀 and 👂 still do).
  if (P.round === 3 && !passed(r)) return;
  const opts = line.choices ?? [{ es: line.es, en: line.en }];
  const optText = line.choices ? opts[r.option].es : lineOptions(line)[r.option];
  li.querySelectorAll(".opt").forEach((o, k) => o.classList.toggle("dim", line.choices ? k !== r.option : false));
  const es = li.querySelectorAll(".opt")[line.choices ? r.option : 0].querySelector(".es");
  es.classList.remove("veiled", "masked");
  es.removeAttribute("aria-hidden");
  es.innerHTML = colorWords(optText, r.words);
  li.classList.toggle("passed", passed(r));
}

function colorWords(text, words) {
  let k = 0;
  const rank = { ok: 0, close: 1, changed: 2, missed: 2 };
  return text.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part) || !part) return part;
    const n = tokensOf(part).length;
    const ws = words.slice(k, k + n);
    k += n;
    if (!ws.length) return esc(part);
    const worst = ws.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
    const title = worst.status === "ok" ? "" : worst.heard ? ` title="heard: ${esc(worst.heard)}"` : ` title="not heard"`;
    return `<button type="button" class="w ${worst.status}" data-say="${esc(part.replace(/[¿?¡!.,…]/g, ""))}"${title}>${esc(part)}</button>`;
  }).join("");
}

function renderDock(mode) {
  const dock = document.getElementById("dock");
  if (!dock || !P) return;
  if (mode === "listen") {
    dock.innerHTML = `<p class="listening"><span class="dots"><i></i><i></i><i></i></span> Listen…</p>`;
    return;
  }
  const line = P.skit.lines[P.i];
  const recording = P.rec?.state === "recording";
  const r = P.result;
  const tip = soundTip(lineOptions(line)[0]);
  const stuck = P.tries >= 2 && !(r && passed(r));
  const canPeek = P.round > 1 && !P.peeked;
  dock.innerHTML = `
    ${r ? resultHtml(r) : P.round === 1 ? `<p class="sound-tip"><b>🔊 ${esc(tip.sound)}</b> ${esc(tip.tip)}</p>` : ""}
    <div class="dock-row">
      <button type="button" class="tool" data-act="hear" aria-label="Hear the line">👂<span>Oír</span></button>
      <button type="button" class="tool" data-act="slow" aria-label="Hear it slowly">🐢<span>Despacio</span></button>
      <button type="button" class="mic ${recording ? "on" : ""}" data-act="rec" data-own-sound ${P.busy || !micSupported() ? "disabled" : ""}
        aria-label="${recording ? "Stop recording" : "Record your line"}">
        <span class="mic-icon">${P.busy ? "⏳" : recording ? "■" : "🎙️"}</span>
      </button>
      ${canPeek ? `<button type="button" class="tool" data-act="peek" aria-label="Show the Spanish">👀<span>Ver</span></button>` : P.take ? `<button type="button" class="tool" data-act="mine" aria-label="Play my recording">▶<span>Mi voz</span></button>` : `<span class="tool ghost"></span>`}
      <button type="button" class="tool ${stuck ? "push" : ""}" data-act="skip" aria-label="Next line">⏭<span>${stuck ? "Seguir" : "Saltar"}</span></button>
    </div>
    <p class="mic-label muted small">${P.busy ? "Checking…" : recording ? "Listening… tap ■ when you’re done" : micSupported() ? "Your turn — tap 🎙️ (or press space) and say it" : "This browser can’t record. Listen, say it out loud anyway, then tap ⏭."}</p>`;
  dock.querySelector("[data-act=rec]").addEventListener("click", toggleRec);
  dock.querySelector("[data-act=hear]").addEventListener("click", () => { if (P.round > 1) P.peeked = true; modelSay(line).catch((e) => toast(e.message)); });
  dock.querySelector("[data-act=slow]").addEventListener("click", () => { if (P.round > 1) P.peeked = true; modelSay(line, { slow: true }).catch((e) => toast(e.message)); });
  dock.querySelector("[data-act=peek]")?.addEventListener("click", peek);
  dock.querySelector("[data-act=mine]")?.addEventListener("click", () => playUrl(P.take.url));
  dock.querySelector("[data-act=skip]").addEventListener("click", () => nextLine());
  dock.querySelector("[data-act=selfok]")?.addEventListener("click", () => { P.result = { result: "great", self: true }; onPass(); renderDock(); });
  dock.querySelector("[data-act=again]")?.addEventListener("click", () => { P.result = null; renderDock(); toggleRec(); });
}

function resultHtml(r) {
  const line = P.skit.lines[P.i];
  switch (r.result) {
    case "great": return `<p class="result good"><b>${pick(["¡Eso!", "¡Perfecto!", "¡Órale, muy bien!", "¡Qué chido!", "¡Excelente!"])}</b> ${r.self ? "" : "Every word came through."}</p>`;
    case "pass": return `<p class="result good"><b>${pick(["¡Bien!", "¡Muy bien!", "¡Ándale!"])}</b> They’d understand you. ${r.tip ? esc(r.tip.message) : r.words?.some((w) => w.status !== "ok") ? "Tap an orange word to hear it." : ""}</p>`;
    case "sense": return `<p class="result good"><b>${pick(["¡Eso!", "¡Bien dicho!", "¡Así se habla!"])}</b> That works in this conversation. ${r.note ? esc(r.note) : ""}
      <span class="heard">The script says: “${esc(lineOptions(line)[0])}”</span></p>`;
    case "try": {
      if (r.note) return `<p class="result try"><b>${pick(["¡Casi!", "Almost!"])}</b> ${esc(r.note)} ${r.heard ? `<span class="heard">I heard: “${esc(r.heard)}”</span>` : ""}</p>`;
      const missed = r.words?.filter((w) => w.status !== "ok").length ?? 0;
      return `<p class="result try"><b>${pick(["¡Casi!", "Almost!", "¡Otra vez!"])}</b> ${r.tip ? esc(r.tip.message) : P.round === 3 ? "That didn’t quite fit the conversation. Tap 👂 to hear one way to say it." : `${plural(missed, "word")} didn’t come through. Tap them to hear them, then try again.`}
        ${r.heard ? `<span class="heard">I heard: “${esc(r.heard)}”</span>` : ""}</p>`;
    }
    case "nothing": return `<p class="result try"><b>🙉 I didn’t catch that.</b> Say it a little louder, closer to the mic. Loud is good!</p>`;
    case "self": return `<p class="result">Listen to yours (▶) and the model (👂). Did it sound about the same?
      <span class="dock-row inline"><button type="button" class="btn small primary" data-act="selfok">✅ Sí</button><button type="button" class="btn small" data-act="again">🔁 Otra vez</button></span></p>`;
    case "error": return `<p class="result try">⚠️ ${esc(r.message)}</p>`;
    default: return "";
  }
}

async function toggleRec() {
  if (!P || P.busy) return;
  if (P.rec?.state === "recording") return finishRec();
  if (P.rec && P.rec.state !== "idle") return;
  stop();
  P.result = null; // the last answer goes away while you try again
  P.rec = new Recorder();
  const tok = P.token;
  try {
    await P.rec.start({
      onLevel: (l) => document.querySelector(".mic.on")?.style.setProperty("--level", l.toFixed(2)),
      onAutoStop: () => finishRec(),
    });
  } catch (e) {
    toast(e.message, 5000);
    return;
  }
  if (P?.token === tok) renderDock();
}

/** The conversation up to the current line, for the meaning checker. */
function contextFor(i) {
  const out = [];
  for (let k = i - 1; k >= 0 && out.length < 4; k--) {
    const l = P.skit.lines[k];
    if (l.who === "scene") break;
    out.unshift({ who: l.who === "me" ? "Learner" : P.skit.cast[l.who].name, es: l.choices ? l.choices[0].es : l.es });
  }
  return out;
}

/**
 * Grade an attempt. Rounds 1–2: the words of the line. Round 3 and reviews: the words, or
 * — if the learner said it their own way — whether it makes sense in the conversation.
 */
async function grade(line, text) {
  const options = lineOptions(line);
  const r = scoreLine(options, text);
  if (r.result === "nothing") return r;
  const free = P.round === 3;
  if (!free) return r;

  if (P.review) {
    // Reviews test the phrase: it has to be in there, said well or used in a sensible reply.
    const has = saidPhrase(text, line.phrase);
    if (passed(r) && has) return r;
    if (!has) return { ...r, result: "try", note: `Try to use “${line.phrase.es.replace(/^[¿¡]|[?!.]$/g, "")}” (${line.phrase.en}).` };
  } else if (passed(r)) {
    return r;
  }
  try {
    const v = await judge({
      scene: P.skit.scene ?? line.scene, country: COUNTRIES[line.country ?? P.skit.country]?.name,
      context: contextFor(P.i), intent: line.choices ? line.choices.map((c) => c.en).join(" / ") : line.en,
      expected: options, said: text,
    });
    if (v.ok) return { result: "sense", heard: r.heard, note: v.note, words: [], option: 0 };
    return { ...r, result: "try", note: v.note || "" };
  } catch {
    // No meaning checker reachable: be generous with near-misses so a different wording can still pass.
    return r.score >= LOOSE_PASS ? { ...r, result: "pass" } : r;
  }
}

async function finishRec() {
  const tok = P?.token;
  if (!P || P.rec?.state !== "recording") return;
  P.busy = true;
  renderDock();
  const take = await P.rec.stop();
  if (!P || P.token !== tok) return;
  P.take = take;
  S.markActive(); // any try counts as practicing today, even if nothing was heard
  if (!take?.speech) {
    P.busy = false;
    P.result = { result: "nothing" };
    renderDock();
    return;
  }
  P.tries++;
  const line = P.skit.lines[P.i];
  const h = await health();
  if (!h.stt) {
    P.result = { result: "self" };
  } else {
    try {
      const out = await transcribe(take.wav);
      if (!P || P.token !== tok) return;
      P.result = await grade(line, out.text);
      P.result.text = out.text;
    } catch (e) {
      P.result = { result: "error", message: e.message };
    }
  }
  if (!P || P.token !== tok) return;
  if (P.result.result !== "error") S.recordAttempt({ seconds: take.duration ?? 0, passed: passed(P.result) });
  P.busy = false;
  paintResult(P.result);
  renderDock();
  bindWordTaps();
  if (passed(P.result)) onPass();
  else sfx.oops();
}

function bindWordTaps() {
  currentBubble()?.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => {
    const v = lineVoice(P.skit.lines[P.i]);
    speak(b.dataset.say, { voice: v, gender: voiceGender(v), slow: true }).catch((e) => toast(e.message));
  }));
}

/** Words the learner actually got right in this attempt. */
function wordsWon(r, line) {
  if (r.result === "sense") {
    // Their own words: count the ones that are real words from this skit's script.
    const known = new Set(P.skit.lines.flatMap((l) => (l.choices ? l.choices.map((c) => c.es) : [l.es])).flatMap(wordsOf));
    return wordsOf(r.text ?? r.heard).filter((w) => known.has(w));
  }
  if (r.words?.length) return [...new Set(r.words.filter((w) => w.status === "ok").map((w) => w.word))];
  return r.self ? wordsOf(line.choices ? line.choices[0].es : line.es) : [];
}

function onPass() {
  const line = P.skit.lines[P.i];
  const firstTry = P.tries <= 1 && !P.peeked;
  if (firstTry) P.firstTry++;
  const said = P.result.result === "sense" ? (P.result.text ?? P.result.heard) : line.choices ? line.choices[P.result.option ?? 0].es : lineOptions(line)[P.result.option ?? 0];
  S.learnWords(wordsWon(P.result, line));
  const skitId = line.src ?? P.skit.id;
  const src = skitById(skitId) ?? P.skit;
  for (const p of phrasesIn(said, src)) {
    S.learnPhrase(skitId, p, said);
    P.learned.add(p.es);
  }
  if (P.review) gradeReview(line, firstTry);
  currentBubble()?.classList.add("passed");
  confetti(document.querySelector(".mic"));
  const tok = P.token, i = P.i;
  setTimeout(() => { if (P && P.token === tok && P.i === i) nextLine(); }, P.result.result === "great" ? 1100 : 2200);
}

function nextLine() {
  if (!P) return;
  if (P.rec?.state === "recording") P.rec.cancel();
  stop();
  const line = P.skit.lines[P.i];
  if (P.review && line?.who === "me") gradeReview(line, false); // skipped or never passed
  const li = currentBubble();
  if (li) {
    li.classList.remove("current");
    if (!li.classList.contains("passed")) peekInto(li, line);
  }
  P.i++;
  advance();
}

/** After moving on, show the full line in the bubble so it can be read back. */
function peekInto(li, line) {
  const opts = line?.choices ?? (line ? [{ es: line.es }] : []);
  li.querySelectorAll(".opt").forEach((o, k) => {
    const es = o.querySelector(".es");
    if (!es || !opts[k]) return;
    es.classList.remove("veiled", "masked");
    es.removeAttribute("aria-hidden");
    if (es.querySelector(".blank") || P.round === 3) es.textContent = opts[k].es;
  });
}

function finishSkit() {
  const skit = P.skit, round = P.round;
  const before = LEVELS.map((L) => levelUnlocked(L.n));
  const was = S.skitProgress(skit.id).rounds ?? 0;
  S.finishSkit(skit.id, round);
  const opened = LEVELS.find((L, k) => !before[k] && levelUnlocked(L.n));
  const learned = skit.phrases.filter((p) => P.learned.has(p.es));
  const nextR = round < 3 ? round + 1 : null;
  const next = nextSkit(skit.id);
  document.getElementById("bar").style.width = "100%";
  document.getElementById("dock").innerHTML = "";
  const st = S.stats();
  const li = document.createElement("li");
  li.className = "finish";
  li.innerHTML = `
    <h2>${pick(["¡Lo lograste!", "¡Qué chido!", "¡Bien hecho!"])}</h2>
    <p class="big-rounds">${roundsHtml(Math.max(was, round))}</p>
    <p><b>Ronda ${round} · ${esc(ROUNDS[round - 1].name)}</b> done. ${P.firstTry} of ${P.meLines} lines on the first try.</p>
    <p class="muted small">🔥 ${plural(st.current, "day")} in a row · ${plural(st.words, "word")} learned · ${plural(st.phrases, "phrase")}</p>
    ${opened ? `<p class="note good">🔓 Level ${opened.n} is open: <b>${esc(opened.name)}</b> (${esc(opened.en)})!</p>` : ""}
    ${nextR && round >= was ? `<p class="note">Next: <b>Ronda ${nextR} · ${esc(ROUNDS[nextR - 1].name)}</b> — ${esc(ROUNDS[nextR - 1].blurb)}</p>` : ""}
    ${learned.length ? `<h3>You said these out loud</h3><ul class="learned">${learned.map((p) => `<li><button type="button" class="chip" data-phrase="${skit.phrases.indexOf(p)}">${esc(p.es)}</button> <span class="muted">${esc(p.en)}</span></li>`).join("")}</ul>` : ""}
    ${backupNudgeHtml()}
    <div class="row">
      ${nextR ? `<button type="button" class="btn primary" id="next-round">▶ Ronda ${nextR}</button>` : ""}
      <a class="btn ${nextR ? "" : "primary"}" href="#/skit/${next.id}">${nextR ? "" : "▶ "}${esc(next.title)} ${COUNTRIES[next.country].flag}</a>
      <button type="button" class="btn" id="again">🔁 Otra vez</button>
    </div>`;
  document.getElementById("convo").append(li);
  li.querySelectorAll("[data-phrase]").forEach((b) => b.addEventListener("click", () => showPhrase(skit, +b.dataset.phrase)));
  li.querySelector("#again").addEventListener("click", () => startSkit(skit, round));
  li.querySelector("[data-backup=down]")?.addEventListener("click", (e) => { downloadBackup(); e.target.closest("p").remove(); });
  li.querySelector("#next-round")?.addEventListener("click", () => startSkit(skit, nextR));
  scrollDown(li);
  confetti(li.querySelector(".big-rounds"));
}

// ───────────────────────── review (repaso) ─────────────────────────

function viewReview() {
  const due = S.duePhrases(6);
  const all = S.phrases();
  if (!all.length) {
    render(`<h1>Repaso</h1><p class="note">Reviews start after your first skit: every phrase you say out loud comes back here to test you, after 1 day, then 3, 7, 14, 30 and 60. <a href="#/skit/${nextSkit().id}">Play a skit</a></p>`);
    return;
  }
  const upcoming = all.filter((p) => p.due > localDay()).sort((a, b) => (a.due < b.due ? -1 : 1));
  const practice = [...all].sort((a, b) => (a.box ?? 1) - (b.box ?? 1) || (a.due < b.due ? -1 : 1)).slice(0, 6);
  render(`
    <h1>Repaso</h1>
    <p class="lede">A quick test: you hear the line before, then say your reply with <b>no Spanish on screen</b>. Use the slang phrase — any reply that makes sense counts.</p>
    ${due.length
      ? `<p><button type="button" class="btn primary big" id="go">▶ Review ${plural(due.length, "phrase")}</button></p>`
      : `<p class="note good">✓ Nothing due today. Next review: <b>${upcoming[0] ? relativeDayFuture(upcoming[0].due) : "—"}</b>.</p>
         <p><button type="button" class="btn" id="practice">🔁 Practice anyway (doesn’t change your schedule)</button></p>`}
    <h2>How well you know them</h2>
    <div class="boxes">${[1, 2, 3, 4, 5, 6].map((b) => {
      const n = all.filter((p) => (p.box ?? 1) === b).length;
      return `<div class="box-col"><b>${n}</b><span>${["New", "1 day", "3 days", "1 week", "2 weeks", "1–2 months"][b - 1]}</span></div>`;
    }).join("")}</div>
    <p class="muted small">Get a phrase right on the first try and it moves one box to the right (it comes back later). Miss it and it goes back to the first box.</p>
  `);
  document.getElementById("go")?.addEventListener("click", () => startReview(due, false));
  document.getElementById("practice")?.addEventListener("click", () => startReview(practice, true));
}

function relativeDayFuture(day) {
  const n = Math.round((new Date(`${day}T12:00`) - new Date(`${localDay()}T12:00`)) / 864e5);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

function startReview(items, practice) {
  const skit = buildReview(items);
  if (!skit.lines.length) return toast("Those phrases aren’t in the skits any more.");
  S.markActive();
  S.askToKeepData();
  P = {
    skit, review: true, practice, level: { rate: 1 }, round: 3, echo: false, meVoice: "selena",
    i: 0, firstTry: 0, meLines: skit.lines.filter((l) => l.who === "me").length, graded: false, reviewed: [],
    tries: 0, peeked: false, rec: null, take: null, result: null, busy: false, learned: new Set(), token: Symbol("review"),
  };
  prefetch(skit.lines.filter((l) => l.who !== "scene").map((l) => (l.who === "me" ? [l.es, l.voice] : [l.es, skit.cast[l.who].voice])));
  openStage("Repaso", practice ? "practice" : plural(P.meLines, "phrase"), "#/repaso");
}

/** Record one review answer (once per line). */
function gradeReview(line, ok) {
  if (P.graded) return;
  P.graded = true;
  P.reviewed.push({ es: line.phrase.es, ok });
  if (!P.practice) S.reviewPhrase(line.src, line.phrase.es, ok);
}

function finishReview() {
  document.getElementById("bar").style.width = "100%";
  document.getElementById("dock").innerHTML = "";
  const ok = P.reviewed.filter((r) => r.ok).length;
  const li = document.createElement("li");
  li.className = "finish";
  li.innerHTML = `
    <h2>${ok === P.reviewed.length ? "¡Perfecto!" : ok ? "¡Bien!" : "¡Ánimo!"}</h2>
    <p class="big-num">${ok}<small>/${P.reviewed.length}</small></p>
    <p>${ok === P.reviewed.length ? "You remembered every phrase." : "Remembered on the first try."} ${P.practice ? "" : "The ones you missed come back tomorrow."}</p>
    <ul class="learned">${P.reviewed.map((r) => `<li>${r.ok ? "✅" : "🔁"} ${esc(r.es)}</li>`).join("")}</ul>
    <div class="row"><a class="btn primary" href="#/">Skits</a><a class="btn" href="#/progreso">Progreso</a></div>`;
  document.getElementById("convo").append(li);
  scrollDown(li);
  if (ok) confetti(li.querySelector(".big-num"));
}

// ───────────────────────── phrases in lines ─────────────────────────

const stripPunct = (s) => s.replace(/^[\s¿¡]+|[\s?!.…,]+$/g, "");

function highlight(text, skit) {
  let html = "", at = 0;
  for (const [s, e, pi] of phraseRanges(text, skit)) {
    html += esc(text.slice(at, s)) + `<button type="button" class="phr${skit.phrases[pi].spicy ? " spicy" : ""}" data-phrase="${pi}">${esc(text.slice(s, e))}</button>`;
    at = e;
  }
  return html + esc(text.slice(at));
}

function bindPhrases(root) {
  root?.querySelectorAll("[data-phrase]").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showPhrase(P?.skit, +b.dataset.phrase);
    });
  });
}

function showPhrase(skit, i) {
  if (!skit) return;
  const p = skit.phrases[i];
  const country = p.country ?? skit.country;
  const voice = p.voice ?? Object.values(skit.cast)[0].voice;
  let sheet = document.getElementById("sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Phrase");
    document.body.append(sheet);
  }
  sheet.innerHTML = `
    <button type="button" class="close" aria-label="Close">✕</button>
    <p class="sheet-es">${esc(p.es)} ${p.spicy ? `<span class="tag spicy" title="informal — fine with friends, careful with strangers">🌶️ informal</span>` : ""}</p>
    <p>${esc(p.en)}</p>
    ${p.note ? `<p class="muted small">${esc(p.note)}</p>` : ""}
    <p class="muted small">${COUNTRIES[country].flag} ${COUNTRIES[country].name}</p>
    <div class="row"><button type="button" class="btn small" data-a="1">👂 Oír</button><button type="button" class="btn small" data-a="slow">🐢 Despacio</button></div>`;
  sheet.classList.add("show");
  const say = (slow) => speak(stripPunct(p.es), { voice, gender: voiceGender(voice), slow }).catch((e) => toast(e.message));
  sheet.querySelector(".close").addEventListener("click", closeSheet);
  sheet.querySelector("[data-a='1']").addEventListener("click", () => say(false));
  sheet.querySelector("[data-a=slow]").addEventListener("click", () => say(true));
  say(false);
}

function closeSheet() { document.getElementById("sheet")?.classList.remove("show"); }

// ───────────────────────── saving & moving progress ─────────────────────────

/** Warnings when progress can't be kept, or is being kept somewhere unexpected. */
function savingNotice() {
  if (!S.storageWorks())
    return `<p class="note warn">⚠️ <b>This browser isn’t saving your progress</b> (private browsing, or site data is blocked). Use a normal window, or allow site data for this page, so your streak and words are kept.</p>`;
  if (location.hostname !== HOME_HOST && /workers\.dev$/.test(location.hostname))
    return `<p class="note warn">📍 You’re on a second address for this app. Progress is saved <b>separately for each web address</b>, so use <a href="https://${HOME_HOST}/">${HOME_HOST}</a>. To bring progress from here, <a href="#/progreso">download it</a> and upload it there.</p>`;
  return "";
}

function downloadBackup() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([S.exportData()], { type: "application/json" }));
  a.download = `skit-spanish-progress-${localDay()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  toast("Progress downloaded ✓ — keep the file, or upload it on another device");
}

async function uploadBackup(file, after) {
  if (!file) return;
  try {
    const r = S.importData(await file.text());
    const bits = [r.rounds && plural(r.rounds, "round"), r.words && plural(r.words, "word"), r.phrases && plural(r.phrases, "phrase"), r.days && plural(r.days, "day")].filter(Boolean);
    toast(bits.length ? `Progress added: ${bits.join(", ")} ✓` : "Uploaded ✓ — nothing new in that file", 4000);
    after?.();
  } catch (err) { toast(err.message, 5000); }
}

/** The "your progress lives here" panel, with download and upload. */
function backupPanelHtml() {
  const last = S.lastBackup();
  const lastTxt = last ? relativeDay(localDay(new Date(last))) : "never";
  return `
    <section class="panel backup" id="backup">
      <h2>💾 Your progress</h2>
      <p>It’s saved <b>in this browser, on this device</b> — no account needed. Last downloaded: <b>${esc(lastTxt)}</b>.</p>
      <div class="row">
        <button type="button" class="btn primary small" data-backup="down">⬇ Download my progress</button>
        <label class="btn small">⬆ Upload progress<input type="file" accept="application/json,.json" data-backup="up" hidden></label>
      </div>
      <details>
        <summary>Using another phone or computer?</summary>
        <ol class="small">
          <li>Here, tap <b>Download my progress</b>. You get a small file.</li>
          <li>Send the file to the other device (email it to yourself, AirDrop, Google Drive…).</li>
          <li>Open <b>${HOME_HOST}</b> there, go to <b>Progreso</b>, and tap <b>Upload progress</b>.</li>
        </ol>
        <p class="muted small">Uploading adds to what’s already on that device. Nothing is erased: you keep the best rounds, every day used, and every word and phrase from both.
        Each web address and each browser keeps its own copy (on iPhone, the home-screen app and Safari count as two).</p>
      </details>
    </section>`;
}

function bindBackup(rerender) {
  app.querySelector("[data-backup=down]")?.addEventListener("click", () => { downloadBackup(); rerender?.(); });
  app.querySelector("[data-backup=up]")?.addEventListener("change", (e) => uploadBackup(e.target.files[0], rerender));
}

/** On the finish screen: remind to back up once there's something worth keeping. */
function backupNudgeHtml() {
  const st = S.stats();
  const last = S.lastBackup();
  const stale = !last ? st.daysUsed >= 2 : Date.now() - last > 14 * 864e5;
  if (!stale || !S.storageWorks()) return "";
  return `<p class="note small">💾 Your progress is saved in this browser only. <button type="button" class="linkish" data-backup="down">Download a copy</button> to keep it safe or use it on another device.</p>`;
}

// ───────────────────────── progress page ─────────────────────────

function viewProgress() {
  const st = S.stats();
  const tile = (icon, value, label, sub = "") => `<div class="tile"><span class="tile-icon" aria-hidden="true">${icon}</span><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  render(`
    <h1>Progreso</h1>
    ${savingNotice()}
    <div class="tiles">
      ${tile("🔥", st.current, "day streak", st.current && !st.practicedToday ? "practice today to keep it" : st.practicedToday ? "✓ practiced today" : "")}
      ${tile("🏆", st.longest, "best streak")}
      ${tile("📅", st.daysUsed, st.daysUsed === 1 ? "day used" : "days used")}
      ${tile("🕒", relativeDay(st.lastDay), "last practice")}
      ${tile("💬", st.words, "words learned", "said correctly at least once")}
      ${tile("🌶️", st.phrases, "slang phrases", `<a href="#/frases">see them</a>`)}
      ${tile("🎙️", st.lines, "lines spoken", `${st.passed} came through`)}
      ${tile("⏱", st.seconds < 60 ? `${Math.round(st.seconds)}s` : `${Math.round(st.seconds / 60)} min`, "time talking", "out loud, in Spanish")}
      ${tile("🔁", st.due, "to review", st.due ? `<a href="#/repaso">review now</a>` : "all caught up")}
    </div>
    ${backupPanelHtml()}
    <h2>Practice calendar <small>last 15 weeks</small></h2>
    ${calendarHtml(S.activity())}
    <h2>Skits <small>${st.roundsDone} of ${SKITS.length * 3} rounds</small></h2>
    <table class="skit-table">
      <thead><tr><th scope="col">Skit</th><th scope="col">Rounds</th><th scope="col">Played</th></tr></thead>
      <tbody>${SKITS.map((s) => {
        const p = S.skitProgress(s.id);
        return `<tr><td>${COUNTRIES[s.country].flag} ${levelUnlocked(s.level) ? `<a href="#/skit/${s.id}">${esc(s.title)}</a>` : `<span class="muted">${esc(s.title)} 🔒</span>`}</td>
          <td>${roundsHtml(p.rounds ?? 0)}</td><td class="num">${p.plays ? `${p.plays}×` : "—"}</td></tr>`;
      }).join("")}</tbody>
    </table>
  `);
  bindBackup(viewProgress);
}

/** A GitHub-style grid of the last 15 weeks; darker = more lines spoken that day. */
function calendarHtml(days) {
  const today = localDay();
  const t = new Date(`${today}T12:00`);
  const end = addDays(today, 6 - ((t.getDay() + 6) % 7)); // this week's Sunday (weeks start Monday)
  const start = addDays(end, -15 * 7 + 1);
  const level = (n) => (!n ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4);
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const a = days[d];
    const n = a?.lines ?? (a ? 1 : 0);
    const label = `${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${a ? plural(a.lines ?? 0, "line") + (a.reviews ? `, ${a.reviews} reviewed` : "") : "no practice"}`;
    cells.push(d > today ? `<i class="cal-cell future"></i>` : `<i class="cal-cell l${level(n)}${d === today ? " today" : ""}" title="${esc(label)}" aria-label="${esc(label)}" role="img"></i>`);
  }
  return `<div class="cal" role="group" aria-label="Practice calendar">${cells.join("")}</div>
    <p class="cal-legend muted small">Less <i class="cal-cell l0"></i><i class="cal-cell l1"></i><i class="cal-cell l2"></i><i class="cal-cell l3"></i><i class="cal-cell l4"></i> More</p>`;
}

// ───────────────────────── phrases page ─────────────────────────

function viewPhrases() {
  const list = S.phrases();
  const bySkit = {};
  for (const p of list) (bySkit[p.skit] ??= []).push(p);
  render(`
    <h1>Mis frases</h1>
    <p class="muted">Every phrase you’ve said out loud, with the line you said it in. Tap to hear it again.</p>
    ${list.length ? Object.entries(bySkit).map(([id, ps]) => {
      const s = skitById(id);
      if (!s) return "";
      return `<section class="phrase-group">
        <h2>${COUNTRIES[s.country].flag} <a href="#/skit/${s.id}">${esc(s.title)}</a></h2>
        <ul class="phrase-list">${ps.map((p) => `
          <li><button type="button" class="chip" data-say="${esc(stripPunct(p.es))}" data-voice="${Object.values(s.cast)[0].voice}">${esc(p.es)}</button>
            <span>${esc(p.en)}</span>
            <q class="muted small" data-say="${esc(p.line)}" data-voice="${meVoice(s)}">${esc(p.line)}</q></li>`).join("")}</ul>
      </section>`;
    }).join("") : `<p class="note">Nothing yet. <a href="#/skit/${nextSkit().id}">Play your first skit</a> and the phrases you say will collect here.</p>`}
  `);
  app.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () =>
    speak(b.dataset.say, { voice: b.dataset.voice, gender: voiceGender(b.dataset.voice) }).catch((e) => toast(e.message))));
}

// ───────────────────────── settings ─────────────────────────

async function viewSettings() {
  const s = S.settings();
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  render(`
    <h1>Ajustes</h1>
    <section class="panel">
      <h2>Practice</h2>
      <label class="field">Hear my line before I say it (round 1)
        <select data-sel="echo">
          ${opt("auto", "In level 1 only (recommended)", s.echo)}
          ${opt("on", "Always", s.echo)}
          ${opt("off", "Never", s.echo)}
        </select>
      </label>
      <div class="toggles">
        <label><input type="checkbox" data-set="handsFree" ${s.handsFree ? "checked" : ""}> 🎙️ Listen automatically on my turn (hands-free)</label>
        <label><input type="checkbox" data-set="slowAi" ${s.slowAi ? "checked" : ""}> 🐢 Others talk slower</label>
        <label><input type="checkbox" data-set="showEn" ${s.showEn ? "checked" : ""}> 🇺🇸 Show English under every line</label>
        <label><input type="checkbox" data-set="sounds" ${s.sounds ? "checked" : ""}> 🔔 Sound effects on buttons and answers</label>
        <label><input type="checkbox" data-set="unlockAll" ${s.unlockAll ? "checked" : ""}> 🔓 Open all levels (if you already speak some Spanish)</label>
      </div>
    </section>
    <section class="panel">
      <h2>Voice &amp; speech checker</h2>
      <p id="health" class="muted small">Checking…</p>
      <label class="field">Voice
        <select data-sel="ttsSource">
          ${opt("auto", "Automatic (natural AI voices when online)", s.ttsSource)}
          ${opt("server", "Always the AI voices", s.ttsSource)}
          ${opt("browser", "This device’s voice", s.ttsSource)}
        </select>
      </label>
      <label class="field">Device voice
        <select data-sel="browserVoice" id="bvoice"><option value="">Automatic (Mexican / Latin American first)</option></select>
      </label>
      <label class="field">Passcode <small class="muted">(only if your server has one)</small>
        <input type="password" data-text="passcode" value="${esc(s.passcode)}" autocomplete="off">
      </label>
    </section>
    <section class="panel">
      <h2>Progress</h2>
      <p class="small">Saved in this browser on this device. Download it to keep a copy or to move it to another device, then upload it there (it’s added to what’s already there).</p>
      <div class="row">
        <button type="button" class="btn small" data-backup="down">⬇ Download my progress</button>
        <label class="btn small">⬆ Upload progress<input type="file" accept="application/json,.json" data-backup="up" hidden></label>
        <button type="button" class="btn small danger" id="reset">Start over</button>
      </div>
      ${S.storageWorks() ? "" : `<p class="note warn small">⚠️ This browser isn’t saving data right now (private browsing?).</p>`}
    </section>
    <p class="muted small">Everything you do is kept in this browser. Recordings are sent to the speech checker and not stored.</p>
  `);
  bindToggles();
  app.querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.sel, el.value)));
  app.querySelectorAll("[data-text]").forEach((el) => el.addEventListener("change", () => { S.setSetting(el.dataset.text, el.value.trim()); health(true).then(showHealth); }));
  const fillVoices = () => {
    const sel = document.getElementById("bvoice");
    if (!sel) return;
    sel.innerHTML = `<option value="">Automatic (Mexican / Latin American first)</option>` +
      browserVoices().map((v) => `<option value="${esc(v.name)}" ${v.name === s.browserVoice ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  };
  fillVoices();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = fillVoices;
  bindBackup();
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Erase all your progress and phrases on this device?")) { S.resetProgress(); toast("Progress erased"); }
  });
  showHealth(await health(true));
}

function showHealth(h) {
  const el = document.getElementById("health");
  if (!el) return;
  el.innerHTML = h.stt
    ? `✅ Speech checker online (${esc(h.backend)}, ${esc(h.model)}). ${h.tts ? "AI voices on." : ""} ${h.judge ? "Free replies checked for meaning." : ""}`
    : `⚪ Speech checker offline${h.error ? ` (${esc(h.error)})` : ""}. You can still practice: record yourself and compare with the model by ear.`;
}

// ───────────────────────── boot ─────────────────────────

document.addEventListener("keydown", (e) => {
  if (!P || e.code !== "Space" || e.repeat) return;
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement?.tagName ?? "")) return;
  if (P.skit.lines[P.i]?.who !== "me") return;
  e.preventDefault();
  toggleRec();
});
document.addEventListener("click", (e) => {
  const sheet = document.getElementById("sheet");
  if (sheet?.classList.contains("show") && !sheet.contains(e.target) && !e.target.closest("[data-phrase]")) closeSheet();
});

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
window.addEventListener("hashchange", route);
installClickSounds();
route();
