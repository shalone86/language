// Hablar: practice everyday Spanish out loud in short skits with an AI partner.
// Plain ES modules, no build step (same setup as the articulation app).

import { SKITS, LEVELS, COUNTRIES, skitById, skitsInLevel, lineOptions } from "./data/skits.js";
import { Recorder, micSupported } from "./audio.js";
import { speak, stop, prefetch, playUrl, browserVoices } from "./tts.js";
import { health, transcribe } from "./api.js";
import { scoreLine, isPass, soundTip, fold, tokens as tokensOf } from "./score.js";
import * as S from "./store.js";

const app = document.getElementById("app");
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ───────────────────────── progress rules ─────────────────────────

export function levelUnlocked(n) {
  if (n <= 1 || S.settings().unlockAll) return true;
  if (!levelUnlocked(n - 1)) return false;
  const done = skitsInLevel(n - 1).filter((s) => S.skitProgress(s.id).done).length;
  return done >= LEVELS[n - 1].unlockAfter;
}

/** The skit the big "practice now" button opens: first unfinished, then weakest. */
function nextSkit(after) {
  const open = SKITS.filter((s) => levelUnlocked(s.level));
  const from = after ? open.findIndex((s) => s.id === after) + 1 : 0;
  const rest = [...open.slice(from), ...open.slice(0, from)];
  return rest.find((s) => !S.skitProgress(s.id).done)
    ?? rest.find((s) => s.id !== after && S.skitProgress(s.id).stars < 3)
    ?? rest.find((s) => s.id !== after) ?? open[0];
}

const starsHtml = (n) => `<span class="stars" aria-label="${n} of 3 stars">${"★".repeat(n)}<span class="off">${"★".repeat(3 - n)}</span></span>`;

// ───────────────────────── router ─────────────────────────

const routes = [
  [/^$/, viewHome],
  [/^skit\/([\w-]+)$/, viewSkit],
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
      fn(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/";
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
  const done = SKITS.filter((s) => S.skitProgress(s.id).done).length;
  const phrases = S.phrases().length;
  const streak = S.streak();
  render(`
    <section class="hero">
      <p class="eyebrow">Mexican &amp; Latin American Spanish, out loud</p>
      <h1>Habla sin miedo.</h1>
      <p class="lede">Real everyday scenes. The AI plays the other person, you play you. Say your lines out loud and the app tells you if they came through.</p>
      <a class="btn primary big" href="#/skit/${next.id}">▶ ${S.skitProgress(next.id).done ? "Practicar" : "Empezar"}: ${esc(next.title)} ${COUNTRIES[next.country].flag}</a>
      <p class="stats">
        <span><b>${done}</b>/${SKITS.length} skits</span>
        <a href="#/frases"><b>${phrases}</b> frases</a>
        ${streak ? `<span>🔥 <b>${streak}</b> día${streak > 1 ? "s" : ""}</span>` : ""}
      </p>
    </section>
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
          <p class="muted">${open ? esc(L.blurb) : `🔒 Finish ${L.unlockAfter - prevDone} more skit${L.unlockAfter - prevDone > 1 ? "s" : ""} in level ${L.n - 1} to open this level.`}</p>
        </div>
      </div>
      <div class="skit-grid">
        ${skits.map((s) => {
          const p = S.skitProgress(s.id);
          const inner = `
            <span class="flag" aria-hidden="true">${COUNTRIES[s.country].flag}</span>
            <span class="skit-title">${esc(s.title)}</span>
            <span class="skit-en">${esc(s.en)} · ${COUNTRIES[s.country].name}</span>
            <span class="skit-meta">${p.done ? starsHtml(p.stars) : `<span class="tag">${s.phrases.length} frases</span>`}</span>`;
          return open
            ? `<a class="skit-card" href="#/skit/${s.id}">${inner}</a>`
            : `<div class="skit-card" aria-disabled="true">${inner}</div>`;
        }).join("")}
      </div>
    </section>`;
}

// ───────────────────────── skit player ─────────────────────────

let P = null; // the skit being played

function leaveSkit() {
  if (!P) return;
  P.token = null;
  P.rec?.cancel();
  stop();
  P = null;
  closeSheet();
}

/** The voice used for "your" model lines: a voice from the same region not used by the cast. */
function meVoice(skit) {
  const used = new Set(Object.values(skit.cast).map((c) => c.voice));
  const pool = skit.country === "mx" ? ["javier", "estrella", "sirio"] : skit.country === "co" ? ["celeste", "aquila", "selena"] : ["aquila", "selena"];
  return pool.find((v) => !used.has(v)) ?? pool[0];
}
const voiceGender = (v) => (["sirio", "javier", "aquila", "nestor", "alvaro"].includes(v) ? "m" : "f");

function supportFor(skit) {
  const s = S.settings().support;
  return s === "auto" ? LEVELS[skit.level - 1].support : s;
}

function viewSkit(id) {
  const skit = skitById(id);
  if (!skit) return (location.hash = "#/");
  if (!levelUnlocked(skit.level)) {
    render(`<p class="note">🔒 <b>${esc(skit.title)}</b> is in level ${skit.level}. Finish more skits in level ${skit.level - 1} first. <a href="#/">Back</a></p>`);
    return;
  }
  const L = LEVELS[skit.level - 1];
  const support = supportFor(skit);
  const set = S.settings();
  render(`
    <article class="intro">
      <a href="#/" class="back">← Skits</a>
      <p class="eyebrow">${COUNTRIES[skit.country].flag} ${COUNTRIES[skit.country].name} · Nivel ${skit.level} · ${esc(L.name)}</p>
      <h1>${esc(skit.title)}</h1>
      <p class="lede">${esc(skit.scene)}</p>
      <p class="cast">${Object.values(skit.cast).map((c) => `<span class="who">${esc(c.name)}</span>`).join(" ")} <span class="who me">Tú</span></p>
      <h2>Frases de hoy <small>tap to hear</small></h2>
      <div class="chips">${skit.phrases.map((p, i) => `<button type="button" class="chip${p.spicy ? " spicy" : ""}" data-phrase="${i}">${esc(p.es)}</button>`).join("")}</div>
      <p class="muted small">You’ll meet these in the conversation. No need to memorize them now.</p>
      <div class="how">${{
        echo: "👂 → 🎙️ You’ll hear each of your lines first. Then say it back.",
        read: "📖 → 🎙️ Read your line and say it. Tap 👂 if you want to hear it first.",
        recall: "💭 → 🎙️ You’ll see what to say in English. Say it in Spanish. Tap 👀 to peek.",
      }[support]}</div>
      <div class="toggles">
        <label><input type="checkbox" data-set="handsFree" ${set.handsFree ? "checked" : ""}> 🎙️ Listen automatically on my turn</label>
        <label><input type="checkbox" data-set="slowAi" ${set.slowAi ? "checked" : ""}> 🐢 Others talk slower</label>
        <label><input type="checkbox" data-set="showEn" ${set.showEn ? "checked" : ""}> 🇺🇸 Show English under lines</label>
      </div>
      <button class="btn primary big" id="start">▶ Empezar</button>
    </article>`);
  bindToggles();
  app.querySelectorAll("[data-phrase]").forEach((b) => b.addEventListener("click", () => showPhrase(skit, +b.dataset.phrase)));
  document.getElementById("start").addEventListener("click", () => startSkit(skit));
  const mv = meVoice(skit);
  prefetch(skit.lines.slice(0, 4).flatMap((l) => (l.who === "me" ? lineOptions(l).map((t) => [t, mv]) : [[l.es, skit.cast[l.who].voice]])));
}

function bindToggles() {
  app.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.set, el.checked)));
}

function startSkit(skit) {
  S.startSkit(skit.id);
  const mv = meVoice(skit);
  P = {
    skit, level: LEVELS[skit.level - 1], support: supportFor(skit), meVoice: mv,
    i: 0, firstTry: 0, meLines: skit.lines.filter((l) => l.who === "me").length,
    tries: 0, peeked: false, rec: null, take: null, result: null, busy: false, learned: new Set(),
    token: Symbol("skit"),
  };
  prefetch(skit.lines.flatMap((l) => (l.who === "me" ? lineOptions(l).map((t) => [t, mv]) : [[l.es, skit.cast[l.who].voice]])));
  render(`
    <div class="stage">
      <div class="stage-head">
        <a href="#/skit/${skit.id}" class="back" aria-label="Leave the skit">✕</a>
        <div class="stage-title"><b>${esc(skit.title)}</b> <span class="muted">${COUNTRIES[skit.country].flag}</span></div>
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
    P.tries = 0; P.peeked = false; P.result = null; P.take = null;
    renderDock();
    if (P.support === "echo") {
      await modelSay(line).catch(() => {});
      if (!P || P.token !== tok) return;
    }
    if (S.settings().handsFree && micSupported()) toggleRec();
    return;
  }
  if (P && P.token === tok) finishSkit();
}

function sayAi(line) {
  const c = P.skit.cast[line.who];
  return speak(line.es, { voice: c.voice, gender: c.gender, rate: aiRate() });
}

/** Say the learner's line (or each choice) in the model voice. */
async function modelSay(line, { slow = false } = {}) {
  const tok = P.token;
  const texts = line.choices ? line.choices.map((c) => c.es) : [line.es];
  for (const [k, t] of texts.entries()) {
    if (!P || P.token !== tok) return;
    highlightOption(k);
    await speak(t, { voice: P.meVoice, gender: voiceGender(P.meVoice), slow, rate: 0.95 });
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

function appendAiBubble(line, idx) {
  const c = P.skit.cast[line.who];
  const li = document.createElement("li");
  li.className = "bubble them";
  li.innerHTML = `
    <span class="name">${esc(c.name)}</span>
    <p class="es">${highlight(line.es, P.skit)}</p>
    <p class="en" ${S.settings().showEn ? "" : "hidden"}>${esc(line.en)}</p>
    <span class="bubble-tools"><button type="button" class="mini" data-replay aria-label="Hear it again">🔁</button><button type="button" class="mini" data-en aria-label="Show English">EN</button></span>`;
  li.querySelector("[data-replay]").addEventListener("click", () => speak(line.es, { voice: c.voice, gender: c.gender, rate: aiRate() }).catch((e) => toast(e.message)));
  li.querySelector("[data-replay]").addEventListener("dblclick", () => speak(line.es, { voice: c.voice, gender: c.gender, slow: true }));
  li.querySelector("[data-en]").addEventListener("click", () => { const en = li.querySelector(".en"); en.hidden = !en.hidden; });
  bindPhrases(li);
  document.getElementById("convo").append(li);
  scrollDown(li);
  return li;
}

function optionHtml(o, k, recall) {
  return `
    <div class="opt" data-opt="${k}">
      ${recall ? `<p class="cue">“${esc(o.en)}”</p><p class="es veiled">${highlight(o.es, P.skit)}</p>`
        : `<p class="es">${highlight(o.es, P.skit)}</p><p class="en" ${S.settings().showEn ? "" : "hidden"}>${esc(o.en)}</p>`}
    </div>`;
}

function appendMyBubble(line, idx) {
  const recall = P.support === "recall";
  const opts = line.choices ?? [{ es: line.es, en: line.en }];
  const li = document.createElement("li");
  li.className = `bubble me current${recall ? " recall" : ""}`;
  li.dataset.idx = idx;
  li.innerHTML = `
    <span class="name">Tú${line.choices ? ` <small>· say either one</small>` : ""}</span>
    ${opts.map((o, k) => optionHtml(o, k, recall)).join(line.choices ? `<span class="or">o</span>` : "")}`;
  bindPhrases(li);
  document.getElementById("convo").append(li);
  scrollDown(li);
}

function currentBubble() { return document.querySelector("#convo .current"); }

function peek() {
  P.peeked = true;
  currentBubble()?.querySelectorAll(".veiled").forEach((e) => e.classList.remove("veiled"));
  renderDock();
}

/** Color the words of the line by how they came through. */
function paintResult(r) {
  const li = currentBubble();
  if (!li || !r.words) return;
  const line = P.skit.lines[P.i];
  const opts = line.choices ?? [{ es: line.es, en: line.en }];
  // An alt (other wording) matched better than the main text: show what they actually said.
  const optText = line.choices ? opts[r.option].es : lineOptions(line)[r.option];
  li.querySelectorAll(".opt").forEach((o, k) => o.classList.toggle("dim", line.choices ? k !== r.option : false));
  const target = li.querySelectorAll(".opt")[line.choices ? r.option : 0];
  const es = target.querySelector(".es");
  es.classList.remove("veiled");
  es.innerHTML = colorWords(optText, r.words);
  li.classList.toggle("passed", isPass(r));
}

function colorWords(text, words) {
  let k = 0;
  const parts = text.split(/(\s+)/);
  const rank = { ok: 0, close: 1, changed: 2, missed: 2 };
  return parts.map((part) => {
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
  const stuck = P.tries >= 2 && !(r && isPass(r));
  dock.innerHTML = `
    ${r ? resultHtml(r) : `<p class="sound-tip"><b>🔊 ${esc(tip.sound)}</b> ${esc(tip.tip)}</p>`}
    <div class="dock-row">
      <button type="button" class="tool" data-act="hear" aria-label="Hear your line">👂<span>Oír</span></button>
      <button type="button" class="tool" data-act="slow" aria-label="Hear it slowly">🐢<span>Despacio</span></button>
      <button type="button" class="mic ${recording ? "on" : ""}" data-act="rec" ${P.busy || !micSupported() ? "disabled" : ""}
        aria-label="${recording ? "Stop recording" : "Record your line"}">
        <span class="mic-icon">${P.busy ? "⏳" : recording ? "■" : "🎙️"}</span>
      </button>
      ${P.support === "recall" && !P.peeked ? `<button type="button" class="tool" data-act="peek" aria-label="Show the Spanish">👀<span>Ver</span></button>` : P.take ? `<button type="button" class="tool" data-act="mine" aria-label="Play my recording">▶<span>Mi voz</span></button>` : `<span class="tool ghost"></span>`}
      <button type="button" class="tool ${stuck ? "push" : ""}" data-act="skip" aria-label="Next line">⏭<span>${stuck ? "Seguir" : "Saltar"}</span></button>
    </div>
    <p class="mic-label muted small">${P.busy ? "Checking…" : recording ? "Listening… tap ■ when you’re done" : micSupported() ? "Your turn — tap 🎙️ (or press space) and say it" : "This browser can’t record. Listen, say it out loud anyway, then tap ⏭."}</p>`;
  dock.querySelector("[data-act=rec]").addEventListener("click", toggleRec);
  dock.querySelector("[data-act=hear]").addEventListener("click", () => modelSay(line).catch((e) => toast(e.message)));
  dock.querySelector("[data-act=slow]").addEventListener("click", () => modelSay(line, { slow: true }).catch((e) => toast(e.message)));
  dock.querySelector("[data-act=peek]")?.addEventListener("click", peek);
  dock.querySelector("[data-act=mine]")?.addEventListener("click", () => playUrl(P.take.url));
  dock.querySelector("[data-act=skip]").addEventListener("click", () => nextLine());
  dock.querySelector("[data-act=selfok]")?.addEventListener("click", () => { P.result = { result: "great", self: true }; onPass(); renderDock(); });
  dock.querySelector("[data-act=again]")?.addEventListener("click", () => { P.result = null; renderDock(); toggleRec(); });
}

function resultHtml(r) {
  switch (r.result) {
    case "great": return `<p class="result good"><b>${pick(["¡Eso!", "¡Perfecto!", "¡Órale, muy bien!", "¡Qué chido!", "¡Excelente!"])}</b> ${r.self ? "" : "Every word came through."}</p>`;
    case "pass": return `<p class="result good"><b>${pick(["¡Bien!", "¡Muy bien!", "¡Ándale!"])}</b> They’d understand you. ${r.tip ? esc(r.tip.message) : "Tap an orange word to hear it."}</p>`;
    case "try": {
      const missed = r.words.filter((w) => w.status !== "ok").length;
      return `<p class="result try"><b>${pick(["¡Casi!", "Almost!", "¡Otra vez!"])}</b> ${r.tip ? esc(r.tip.message) : `${missed} word${missed > 1 ? "s" : ""} didn’t come through. Tap them to hear them, then try again.`}
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

async function finishRec() {
  const tok = P?.token;
  if (!P || P.rec?.state !== "recording") return;
  P.busy = true;
  renderDock();
  const take = await P.rec.stop();
  if (!P || P.token !== tok) return;
  P.take = take;
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
      P.result = scoreLine(lineOptions(line), out.text);
    } catch (e) {
      P.result = { result: "error", message: e.message };
    }
  }
  P.busy = false;
  paintResult(P.result);
  renderDock();
  bindWordTaps();
  if (isPass(P.result)) onPass();
}

function bindWordTaps() {
  currentBubble()?.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () =>
    speak(b.dataset.say, { voice: P.meVoice, gender: voiceGender(P.meVoice), slow: true }).catch((e) => toast(e.message))));
}

function onPass() {
  const line = P.skit.lines[P.i];
  if (P.tries <= 1 && !P.peeked) P.firstTry++;
  const said = line.choices ? line.choices[P.result.option ?? 0].es : line.es;
  for (const p of phrasesIn(said, P.skit)) {
    S.learnPhrase(P.skit.id, p, said);
    P.learned.add(p.es);
  }
  currentBubble()?.classList.add("passed");
  confetti(document.querySelector(".mic"));
  const tok = P.token, i = P.i;
  setTimeout(() => { if (P && P.token === tok && P.i === i) nextLine(); }, P.result.result === "great" ? 1100 : 1900);
}

function nextLine() {
  if (!P) return;
  if (P.rec?.state === "recording") P.rec.cancel();
  stop();
  const li = currentBubble();
  if (li) {
    li.classList.remove("current");
    li.querySelectorAll(".veiled").forEach((e) => e.classList.remove("veiled"));
  }
  P.i++;
  advance();
}

function finishSkit() {
  const stars = P.firstTry / P.meLines >= 0.85 ? 3 : P.firstTry / P.meLines >= 0.5 ? 2 : 1;
  const before = LEVELS.map((L) => levelUnlocked(L.n));
  S.finishSkit(P.skit.id, stars);
  const opened = LEVELS.find((L, k) => !before[k] && levelUnlocked(L.n));
  const skit = P.skit;
  const learned = skit.phrases.filter((p) => P.learned.has(p.es));
  const next = nextSkit(skit.id);
  updateBar();
  document.getElementById("bar").style.width = "100%";
  const dock = document.getElementById("dock");
  dock.innerHTML = "";
  const li = document.createElement("li");
  li.className = "finish";
  li.innerHTML = `
    <h2>${pick(["¡Lo lograste!", "¡Qué chido!", "¡Bien hecho!"])}</h2>
    <p class="big-stars">${starsHtml(stars)}</p>
    <p class="muted">${P.firstTry} of ${P.meLines} lines on the first try. ${stars < 3 ? "Play it again for more stars — it gets easier every time." : "Nothing to fear here."}</p>
    ${opened ? `<p class="note good">🔓 Level ${opened.n} is open: <b>${esc(opened.name)}</b> (${esc(opened.en)})!</p>` : ""}
    ${learned.length ? `<h3>You said these out loud</h3><ul class="learned">${learned.map((p) => `<li><button type="button" class="chip" data-phrase="${skit.phrases.indexOf(p)}">${esc(p.es)}</button> <span class="muted">${esc(p.en)}</span></li>`).join("")}</ul>` : ""}
    <div class="row">
      <a class="btn primary" href="#/skit/${next.id}">▶ ${esc(next.title)} ${COUNTRIES[next.country].flag}</a>
      <button type="button" class="btn" id="again">🔁 Otra vez</button>
      <a class="btn" href="#/">Inicio</a>
    </div>`;
  document.getElementById("convo").append(li);
  li.querySelectorAll("[data-phrase]").forEach((b) => b.addEventListener("click", () => showPhrase(skit, +b.dataset.phrase)));
  li.querySelector("#again").addEventListener("click", () => startSkit(skit));
  scrollDown(li);
  if (stars === 3) confetti(li.querySelector(".big-stars"));
}

// ───────────────────────── phrases in lines ─────────────────────────

// Trim the punctuation around a phrase ("¿Neta?" → "Neta"); keep inner commas ("Ay, bendito").
const stripPunct = (s) => s.replace(/^[\s¿¡]+|[\s?!.…,]+$/g, "");
const isLetter = (c) => !!c && /[\p{L}]/u.test(c);

function phraseRanges(text, skit) {
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

function highlight(text, skit) {
  let html = "", at = 0;
  for (const [s, e, pi] of phraseRanges(text, skit)) {
    html += esc(text.slice(at, s)) + `<button type="button" class="phr${skit.phrases[pi].spicy ? " spicy" : ""}" data-phrase="${pi}">${esc(text.slice(s, e))}</button>`;
    at = e;
  }
  return html + esc(text.slice(at));
}

function bindPhrases(root) {
  root.querySelectorAll("[data-phrase]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    showPhrase(P?.skit, +b.dataset.phrase);
  }));
}

function showPhrase(skit, i) {
  if (!skit) return;
  const p = skit.phrases[i];
  const c = Object.values(skit.cast)[0];
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
    <p class="muted small">${COUNTRIES[skit.country].flag} ${COUNTRIES[skit.country].name}</p>
    <div class="row"><button type="button" class="btn small" data-a="1">👂 Oír</button><button type="button" class="btn small" data-a="slow">🐢 Despacio</button></div>`;
  sheet.classList.add("show");
  const say = (slow) => speak(stripPunct(p.es), { voice: c.voice, gender: c.gender, slow }).catch((e) => toast(e.message));
  sheet.querySelector(".close").addEventListener("click", closeSheet);
  sheet.querySelector("[data-a='1']").addEventListener("click", () => say(false));
  sheet.querySelector("[data-a=slow]").addEventListener("click", () => say(true));
  say(false);
}

function closeSheet() { document.getElementById("sheet")?.classList.remove("show"); }

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
      <label class="field">How much help
        <select data-sel="support">
          ${opt("auto", "By level (recommended)", s.support)}
          ${opt("echo", "Echo: hear my line first, then say it", s.support)}
          ${opt("read", "Read: show my line in Spanish", s.support)}
          ${opt("recall", "Recall: show English, hide the Spanish", s.support)}
        </select>
      </label>
      <div class="toggles">
        <label><input type="checkbox" data-set="handsFree" ${s.handsFree ? "checked" : ""}> 🎙️ Listen automatically on my turn (hands-free)</label>
        <label><input type="checkbox" data-set="slowAi" ${s.slowAi ? "checked" : ""}> 🐢 Others talk slower</label>
        <label><input type="checkbox" data-set="showEn" ${s.showEn ? "checked" : ""}> 🇺🇸 Show English under every line</label>
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
      <div class="row">
        <button type="button" class="btn small" id="export">⬇ Back up</button>
        <label class="btn small">⬆ Restore<input type="file" accept="application/json" id="import" hidden></label>
        <button type="button" class="btn small danger" id="reset">Start over</button>
      </div>
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
  document.getElementById("export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([S.exportData()], { type: "application/json" }));
    a.download = `hablar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  document.getElementById("import").addEventListener("change", async (e) => {
    try { S.importData(await e.target.files[0].text()); toast("Restored ✓"); } catch (err) { toast(err.message); }
  });
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Erase all your progress and phrases on this device?")) { S.resetProgress(); toast("Progress erased"); }
  });
  showHealth(await health(true));
}

function showHealth(h) {
  const el = document.getElementById("health");
  if (!el) return;
  el.innerHTML = h.stt
    ? `✅ Speech checker online (${esc(h.backend)}, ${esc(h.model)}). ${h.tts ? "AI voices on." : ""}`
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
route();
