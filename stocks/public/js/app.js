// Skit Stocks by Polar World: learn the market through short interactive skits.
// Same engine as Skit Spanish (skits, three rounds, reviews, streaks, save codes), but the
// questions test understanding: pick an answer, fill in the key word, then explain it yourself.

import { SKITS, LEVELS, skitById, skitsInLevel, allTerms } from "./data/skits.js";
import { ROUNDS, nextRound, roundOpen, relativeDay, localDay, addDays, inAppBrowser } from "./progress.js";
import { matchFill, checkNumber, keywordCheck, modeFor, buildQuiz } from "./grade.js";
import { renderChart, hitTarget } from "./chart.js";
import { Recorder, micSupported } from "./audio.js";
import { speak, stop, prefetch, browserVoices } from "./tts.js";
import { health, transcribe, judge } from "./api.js";
import { sfx, installClickSounds } from "./sound.js";
import { startSync, restore, onStatus, status as syncStatus, syncSoon } from "./sync.js";
import * as S from "./store.js";

const app = document.getElementById("app");
const HOME_HOST = "stocks.shalonely.com";
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ───────────────────────── progress rules ─────────────────────────

export function levelUnlocked(n) {
  if (n <= 1 || S.settings().unlockAll) return true;
  if (!levelUnlocked(n - 1)) return false;
  return skitsInLevel(n - 1).filter((s) => S.skitProgress(s.id).done).length >= LEVELS[n - 1].unlockAfter;
}

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

// ───────────────────────── router & helpers ─────────────────────────

const routes = [
  [/^$/, viewHome],
  [/^skit\/([\w-]+)$/, viewSkit],
  [/^review$/, viewReview],
  [/^progress$/, viewProgress],
  [/^terms$/, viewTerms],
  [/^settings$/, viewSettings],
];

function route() {
  leave();
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

function render(html) { app.innerHTML = html; document.body.classList.remove("in-skit"); }

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
  const colors = ["#2f8fdc", "#16a34a", "#ffb703", "#1b2a4a", "#7fdcff"];
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

// ───────────────────────── saving notices & save code ─────────────────────────

function savingNotice() {
  if (inAppBrowser(navigator.userAgent))
    return `<p class="note warn">⚠️ <b>You’re in another app’s built-in browser</b>, which can forget your progress. Tap the <b>⋯</b> or <b>share</b> menu and choose <b>Open in Safari</b> or <b>Open in Chrome</b>.${S.cloud().code ? ` Your save code is <b class="code">${esc(S.cloud().code)}</b>.` : ""}</p>`;
  if (!S.storageWorks())
    return `<p class="note warn">⚠️ <b>This browser isn’t saving your progress</b> (private browsing, or site data is blocked). Use a normal window so your streak is kept.</p>`;
  if (location.hostname !== HOME_HOST && /workers\.dev$/.test(location.hostname))
    return `<p class="note warn">📍 Progress is saved separately for each web address. Use <a href="https://${HOME_HOST}/">${HOME_HOST}</a>.</p>`;
  return "";
}

function syncLine() {
  const c = S.cloud();
  if (syncStatus.state === "saving") return "☁️ Saving online…";
  if (syncStatus.state === "offline") return "☁️ Couldn’t reach the server just now. It will try again; your progress is safe on this device.";
  return c.savedAt ? `☁️ Saved online ${relativeDay(localDay(new Date(c.savedAt)))}.` : "☁️ Not saved online yet.";
}

function codeBoxHtml() {
  const c = S.cloud();
  return `
    <div class="savecode">
      ${c.code ? `
        <p class="small">Your <b>save code</b> keeps a copy of your progress online. Screenshot it or write it down:</p>
        <p class="code-row"><b class="code big">${esc(c.code)}</b> <button type="button" class="btn small" data-copy-code>📋 Copy</button></p>
        <p class="muted small" data-sync-status>${syncLine()}</p>
        <p class="small">If this phone ever loses your progress, or you get a new one, open the app, go to <b>Progress</b>, and type the code below.</p>`
      : `<p class="small">After your first skit you’ll get a <b>save code</b> that keeps a copy of your progress online, in case this phone clears it.</p>`}
      <form class="restore-row" data-restore>
        <label class="small" for="restore-code"><b>Have a save code?</b></label>
        <input id="restore-code" name="code" placeholder="OSO-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button type="submit" class="btn small primary">Bring back my progress</button>
      </form>
    </div>`;
}

function bindCodeBox(rerender) {
  app.querySelector("[data-copy-code]")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(S.cloud().code); toast("Save code copied ✓"); } catch { toast(S.cloud().code, 6000); }
  });
  app.querySelector("[data-restore]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const r = await restore(e.target.code.value);
      const bits = [r.rounds && plural(r.rounds, "round"), r.terms && plural(r.terms, "term"), r.days && plural(r.days, "day")].filter(Boolean);
      toast(bits.length ? `Welcome back! Restored ${bits.join(", ")} ✓` : "Code linked ✓ — this device now saves to it", 4500);
      rerender?.();
    } catch (err) { toast(err.message, 5000); btn.disabled = false; }
  });
}

// ───────────────────────── home ─────────────────────────

function viewHome() {
  const next = nextSkit();
  const np = S.skitProgress(next.id);
  const st = S.stats();
  render(`
    <section class="hero">
      <img class="hero-logo" src="icon.svg" alt="" width="112" height="112">
      <p class="eyebrow">Skit Stocks · by Polar World</p>
      <h1>Learn the market by talking it through.</h1>
      <p class="lede">Short scenes with a coach and a classmate. Answer, fill in the blanks, then explain it in your own words. Charts you can tap. Your progress is tracked.</p>
      <a class="btn primary big" href="#/skit/${next.id}">▶ ${np.rounds ? `Round ${nextRound(np.rounds)}` : "Start"}: ${esc(next.title)}</a>
      ${st.due ? `<p><a class="btn" href="#/review">🔁 Review ${plural(st.due, "term")}</a></p>` : ""}
      <p class="stats">
        <a href="#/progress">🔥 <b>${st.current}</b> day streak</a>
        <a href="#/terms"><b>${st.terms}</b> terms</a>
        <a href="#/progress"><b>${st.accuracy ?? "–"}${st.accuracy != null ? "%" : ""}</b> first-try</a>
        <a href="#/progress"><b>${st.roundsDone}</b>/${SKITS.length * 3} rounds</a>
      </p>
    </section>
    ${savingNotice()}
    ${!S.hasProgress() && !S.cloud().code ? `<details class="note restore-home"><summary>Used the app before and lost your progress? Enter your save code</summary>${codeBoxHtml()}</details>` : ""}
    ${LEVELS.map(levelHtml).join("")}
  `);
  bindCodeBox(viewHome);
}

function levelHtml(L) {
  const open = levelUnlocked(L.n);
  const prevDone = L.n > 1 ? skitsInLevel(L.n - 1).filter((s) => S.skitProgress(s.id).done).length : 0;
  return `
    <section class="level ${open ? "" : "locked"}" aria-labelledby="lv${L.n}">
      <div class="level-head">
        <span class="level-n">${L.n}</span>
        <div>
          <h2 id="lv${L.n}">${esc(L.name)}</h2>
          <p class="muted">${open ? esc(L.blurb) : `🔒 Finish ${plural(L.unlockAfter - prevDone, "more skit")} in level ${L.n - 1} to open this level.`}</p>
        </div>
      </div>
      <div class="skit-grid">
        ${skitsInLevel(L.n).map((s) => {
          const p = S.skitProgress(s.id);
          const inner = `
            <span class="mod">${esc(s.module)}</span>
            <span class="skit-title">${esc(s.title)}</span>
            <span class="skit-en">${esc(s.sub)}</span>
            <span class="skit-meta">${p.rounds ? roundsHtml(p.rounds) : `<span class="tag">${plural(s.terms.length, "term")}</span>`}</span>`;
          return open ? `<a class="skit-card" href="#/skit/${s.id}">${inner}</a>` : `<div class="skit-card" aria-disabled="true">${inner}</div>`;
        }).join("")}
      </div>
    </section>`;
}

// ───────────────────────── skit intro ─────────────────────────

let P = null;

function leave() {
  if (!P) return;
  P.token = null;
  P.rec?.cancel();
  stop();
  P = null;
  closeSheet();
}

function viewSkit(id, chosen) {
  const skit = skitById(id);
  if (!skit) return (location.hash = "#/");
  if (!levelUnlocked(skit.level)) {
    render(`<p class="note">🔒 <b>${esc(skit.title)}</b> is in level ${skit.level}. Finish more skits in level ${skit.level - 1} first. <a href="#/">Back</a></p>`);
    return;
  }
  const done = S.skitProgress(id).rounds ?? 0;
  const round = chosen && roundOpen(chosen, done) ? chosen : nextRound(done);
  render(`
    <article class="intro">
      <a href="#/" class="back">← Skits</a>
      <p class="eyebrow">Level ${skit.level} · ${esc(LEVELS[skit.level - 1].name)} · ${esc(skit.module)}</p>
      <h1>${esc(skit.title)}</h1>
      <p class="lede">${esc(skit.scene)}</p>
      <p class="cast">${Object.values(skit.cast).map((c) => `<span class="who">${esc(c.name)}</span>`).join(" ")} <span class="who me">You</span></p>
      <h2>Round <small>less help each time</small></h2>
      <div class="round-pick" role="group" aria-label="Choose a round">
        ${ROUNDS.map((r) => {
          const open = roundOpen(r.n, done);
          return `<button type="button" class="round-btn ${r.n === round ? "on" : ""}" data-round="${r.n}" ${open ? "" : "disabled"} aria-pressed="${r.n === round}">
            <b>${r.n <= done ? "✓" : open ? r.n : "🔒"} ${esc(r.name)}</b><span>${esc(r.blurb)}</span></button>`;
        }).join("")}
      </div>
      <h2>Terms in this skit <small>tap for the meaning</small></h2>
      <div class="chips">${skit.terms.map((t, i) => `<button type="button" class="chip" data-term="${i}">${esc(t.t)}</button>`).join("")}</div>
      <div class="toggles">
        <label><input type="checkbox" data-set="speak" ${S.settings().speak ? "checked" : ""}> 🔊 Read the lines out loud</label>
      </div>
      <button class="btn primary big" id="start">▶ Start round ${round}</button>
    </article>`);
  app.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.set, el.checked)));
  app.querySelectorAll("[data-term]").forEach((b) => b.addEventListener("click", () => showTerm(skit.terms[+b.dataset.term])));
  app.querySelectorAll("[data-round]").forEach((b) => b.addEventListener("click", () => viewSkit(id, +b.dataset.round)));
  document.getElementById("start").addEventListener("click", () => startSkit(skit, round));
  if (S.settings().speak) prefetch(skit.lines.filter((l) => l.who !== "me").slice(0, 3).map((l) => [l.text, skit.cast[l.who].voice]));
}

function showTerm(term) {
  let sheet = document.getElementById("sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheet";
    sheet.setAttribute("role", "dialog");
    document.body.append(sheet);
  }
  sheet.innerHTML = `<button type="button" class="close" aria-label="Close">✕</button><p class="sheet-term">${esc(term.t)}</p><p>${esc(term.def)}</p>`;
  sheet.classList.add("show");
  sheet.querySelector(".close").addEventListener("click", closeSheet);
}
function closeSheet() { document.getElementById("sheet")?.classList.remove("show"); }

// ───────────────────────── the stage ─────────────────────────

function startSkit(skit, round = 1) {
  S.startSkit(skit.id);
  S.askToKeepData();
  P = {
    skit, round, i: 0, token: Symbol("skit"),
    turns: skit.lines.filter((l) => l.who === "me").length, firstTry: 0, practiced: new Set(),
    tries: 0, rec: null,
  };
  if (S.settings().speak) prefetch(skit.lines.filter((l) => l.who !== "me").map((l) => [l.text, skit.cast[l.who].voice]));
  render(`
    <div class="stage">
      <div class="stage-head">
        <a href="#/skit/${skit.id}" class="back" aria-label="Leave">✕</a>
        <div class="stage-title"><b>${esc(skit.title)}</b> <span class="muted">· Round ${round}: ${esc(ROUNDS[round - 1].name)}</span></div>
        <div class="bar" aria-hidden="true"><i id="bar"></i></div>
      </div>
      <ol class="convo" id="convo" aria-live="polite"></ol>
    </div>`);
  document.body.classList.add("in-skit");
  advance();
}

function updateBar() {
  const bar = document.getElementById("bar");
  if (bar && P) bar.style.width = `${Math.round((P.i / P.skit.lines.length) * 100)}%`;
}
const scrollDown = (el) => requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "end" }));

async function advance() {
  const tok = P?.token;
  while (P && P.token === tok && P.i < P.skit.lines.length) {
    const line = P.skit.lines[P.i];
    updateBar();
    if (line.who !== "me") {
      const c = P.skit.cast[line.who];
      const li = document.createElement("li");
      li.className = "bubble them";
      li.innerHTML = `<span class="name">${esc(c.name)}</span><p>${esc(line.text)}</p>`;
      document.getElementById("convo").append(li);
      scrollDown(li);
      if (S.settings().speak) {
        li.classList.add("speaking");
        try { await speak(line.text, { voice: c.voice, gender: c.gender }); } catch { await sleep(900); }
        li.classList.remove("speaking");
      } else await sleep(650);
      if (!P || P.token !== tok) return;
      P.i++;
      await sleep(200);
      continue;
    }
    renderTurn(line);
    return;
  }
  if (P && P.token === tok) finishSkit();
}

/** The learner's turn: a card with the question, in the right mode for this round. */
function renderTurn(turn) {
  P.tries = 0;
  P.resolved = false;
  const mode = modeFor(turn, P.round);
  const li = document.createElement("li");
  li.className = `turn mode-${mode}`;
  li.dataset.mode = mode;
  const ask = mode === "explain" ? turn.explain.prompt : turn.ask;
  let body = "";
  if (mode === "choice") {
    const opts = shuffle(turn.choices.map((c, k) => ({ ...c, k })));
    body = `<div class="choices">${opts.map((o) => `<button type="button" class="choice" data-k="${o.k}">${esc(o.t)}</button>`).join("")}</div>`;
  } else if (mode === "fill") {
    const [a, b] = turn.fill.text.split("___");
    body = `<form class="answer-row" data-answer><p class="fill-text">${esc(a)}<input name="a" class="blank-in" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Missing word">${esc(b ?? "")}</p><button class="btn primary small">Check</button></form>`;
  } else if (mode === "number") {
    const n = turn.number;
    body = `<form class="answer-row" data-answer>${n.prefix ? `<span class="affix">${esc(n.prefix)}</span>` : ""}<input name="a" inputmode="decimal" class="num-in" autocomplete="off" aria-label="Your answer">${n.suffix ? `<span class="affix">${esc(n.suffix.trim())}</span>` : ""}<button class="btn primary small">Check</button></form>`;
  } else if (mode === "explain") {
    body = `<form class="explain" data-answer>
      <textarea name="a" rows="3" placeholder="Type it, or tap 🎙️ and say it…"></textarea>
      <div class="row">${micSupported() ? `<button type="button" class="btn small mic-btn" data-mic>🎙️ Say it</button>` : ""}<button class="btn primary small">Check</button></div>
    </form>`;
  } else if (mode === "chart") {
    body = `<div class="chart-box" data-chart>${renderChart(turn.chart).svg}</div><p class="muted small">Tap the chart.</p>`;
  }
  li.innerHTML = `<span class="name">Your turn${P.round > 1 && mode !== "chart" ? ` · ${esc(ROUNDS[P.round - 1].name)}` : ""}</span>
    ${turn.chart && mode !== "chart" ? `<div class="chart-box static">${renderChart(turn.chart).svg}</div>` : ""}
    <p class="ask">${esc(ask)}</p>${body}<div class="feedback" aria-live="polite"></div>`;
  document.getElementById("convo").append(li);
  scrollDown(li);
  bindTurn(li, turn, mode);
}

function bindTurn(li, turn, mode) {
  if (mode === "choice") {
    li.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      if (P.resolved) return;
      const c = turn.choices[+b.dataset.k];
      P.tries++;
      b.classList.add(c.ok ? "right" : "wrong");
      b.disabled = true;
      if (c.ok) resolve(li, turn, true, c.why);
      else { sfx.oops(); feedback(li, "try", `<b>Not quite.</b> ${esc(c.why)}`); }
    }));
  }
  if (mode === "fill" || mode === "number") {
    const form = li.querySelector("[data-answer]");
    form.querySelector("input").focus({ preventScroll: true });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (P.resolved) return;
      const v = form.a.value.trim();
      if (!v) return;
      P.tries++;
      const ok = mode === "fill" ? matchFill(v, turn.fill.answers) : checkNumber(v, turn.number).ok;
      if (ok) return resolve(li, turn, true, turn.choices?.find((c) => c.ok)?.why);
      sfx.oops();
      const answer = mode === "fill" ? turn.fill.answers[0] : `${turn.number.prefix ?? ""}${turn.number.answer}${turn.number.suffix ?? ""}`;
      if (P.tries >= 2) return resolve(li, turn, false, `The answer is <b>${esc(answer)}</b>. ${esc(turn.choices?.find((c) => c.ok)?.why ?? "")}`, true);
      const hint = mode === "fill" ? `Hint: it starts with “${esc(turn.fill.answers[0][0].toUpperCase())}”.` : "Check your math and try once more.";
      feedback(li, "try", `<b>Not quite.</b> ${hint}`);
      form.a.select();
    });
  }
  if (mode === "explain") {
    const form = li.querySelector("[data-answer]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (P.resolved) return;
      const v = form.a.value.trim();
      if (!v) return;
      P.tries++;
      const btn = form.querySelector(".btn.primary");
      btn.disabled = true;
      feedback(li, "", "Checking…");
      const tok = P.token;
      let verdict;
      try {
        verdict = await judge({ topic: turn.term ?? P.skit.title, question: turn.explain.prompt, model: turn.explain.model, keys: turn.explain.keys, said: v });
      } catch {
        const k = keywordCheck(v, turn.explain.keys);
        verdict = { ok: k.ok, note: k.ok ? "" : "Try to cover the main idea in a sentence or two." };
      }
      if (!P || P.token !== tok) return;
      btn.disabled = false;
      if (verdict.ok) return resolve(li, turn, true, `${esc(verdict.note)} <span class="model">A pro might put it: “${esc(turn.explain.model)}”</span>`);
      sfx.oops();
      if (P.tries >= 2) return resolve(li, turn, false, `${esc(verdict.note)} <span class="model">Here’s one way to say it: “${esc(turn.explain.model)}”</span>`, true);
      feedback(li, "try", `<b>Almost.</b> ${esc(verdict.note || "Add a bit more about the main idea.")}`);
    });
    li.querySelector("[data-mic]")?.addEventListener("click", (e) => dictate(e.currentTarget, form.a));
  }
  if (mode === "chart") {
    const box = li.querySelector("[data-chart]");
    box.addEventListener("click", (e) => {
      if (P.resolved) return;
      const svg = box.querySelector("svg");
      const r = svg.getBoundingClientRect();
      const { width, height } = svg.viewBox.baseVal;
      const tap = renderChart(turn.chart).map(((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height);
      const { closes } = renderChart(turn.chart);
      const ok = hitTarget(turn.target, tap, closes);
      P.tries++;
      if (ok) {
        box.innerHTML = renderChart(turn.chart, { mark: { ...tap, ok: true }, reveal: turn.target }).svg;
        return resolve(li, turn, true, "");
      }
      sfx.oops();
      if (P.tries >= 3) {
        box.innerHTML = renderChart(turn.chart, { mark: { ...tap, ok: false }, reveal: turn.target }).svg;
        return resolve(li, turn, false, "Here’s where it is (shaded).", true);
      }
      box.innerHTML = renderChart(turn.chart, { mark: { ...tap, ok: false } }).svg;
      feedback(li, "try", `<b>Not there.</b> ${P.tries === 2 ? chartHint(turn) : "Try again."}`);
    });
  }
}

function chartHint(turn) {
  if (turn.target.y) return `Look for the price where it keeps turning, around $${Math.round((turn.target.y[0] + turn.target.y[1]) / 2)}.`;
  if (turn.target.x === "goldencross") return "Find where the 50-day line climbs over the 200-day line.";
  if (turn.target.x === "rsi70") return "Look at the RSI panel: where does the line poke above 70?";
  return "Look closely at the dips and the moment the line breaks.";
}

function feedback(li, kind, html) {
  const f = li.querySelector(".feedback");
  f.className = `feedback ${kind}`;
  f.innerHTML = html;
}

/** A turn is done: right (maybe after tries) or shown after too many misses. */
function resolve(li, turn, ok, why, revealed = false) {
  P.resolved = true;
  const firstTry = ok && P.tries === 1;
  if (firstTry) P.firstTry++;
  S.recordAnswer({ correct: firstTry });
  if (ok && turn.term) {
    const term = P.skit.terms.find((t) => t.t === turn.term);
    if (term) { S.learnTerm(P.skit.id, term); P.practiced.add(term.t); }
  }
  li.classList.add(ok ? "done-ok" : "done-shown");
  li.querySelectorAll("button.choice, input, textarea, [data-mic]").forEach((el) => { el.disabled = true; });
  feedback(li, ok ? "good" : "shown", `${ok ? `<b>${pick(["Nice!", "That’s it!", "Exactly.", "You got it."])}</b> ` : ""}${why ?? ""}
    <div class="row"><button type="button" class="btn primary small" data-next>Next ›</button></div>`);
  if (ok) sfx.right();
  const say = turn.say ?? turn.choices?.find((c) => c.ok)?.t;
  const next = li.querySelector("[data-next]");
  next.focus({ preventScroll: true });
  next.addEventListener("click", () => {
    if (say) {
      const me = document.createElement("li");
      me.className = "bubble me";
      me.innerHTML = `<span class="name">You</span><p>${esc(say)}</p>`;
      li.after(me);
    }
    next.closest(".row").remove();
    P.i++;
    advance();
  }, { once: true });
  scrollDown(li);
  if (revealed) li.classList.add("revealed");
}

/** Speak an explanation instead of typing it (Whisper turns it into text). */
async function dictate(btn, textarea) {
  if (!P) return;
  if (P.rec?.state === "recording") {
    btn.disabled = true;
    btn.textContent = "⏳ Listening…";
    const take = await P.rec.stop();
    btn.disabled = false;
    btn.textContent = "🎙️ Say it";
    if (!take?.speech) return toast("I didn’t catch that. Try again a little louder.");
    try {
      const { text } = await transcribe(take.wav);
      textarea.value = [textarea.value.trim(), text].filter(Boolean).join(" ");
      textarea.focus();
    } catch (e) { toast(e.message); }
    return;
  }
  stop();
  P.rec = new Recorder();
  try {
    await P.rec.start({ maxMs: 60000, silenceMs: 2500, onAutoStop: () => dictate(btn, textarea) });
    btn.textContent = "■ Done";
  } catch (e) { toast(e.message, 5000); }
}

function finishSkit() {
  const skit = P.skit, round = P.round;
  const before = LEVELS.map((L) => levelUnlocked(L.n));
  const was = S.skitProgress(skit.id).rounds ?? 0;
  S.finishSkit(skit.id, round);
  const opened = LEVELS.find((L, k) => !before[k] && levelUnlocked(L.n));
  const nextR = round < 3 ? round + 1 : null;
  const next = nextSkit(skit.id);
  document.getElementById("bar").style.width = "100%";
  const st = S.stats();
  const learned = skit.terms.filter((t) => P.practiced.has(t.t));
  const li = document.createElement("li");
  li.className = "finish";
  li.innerHTML = `
    <h2>${pick(["Lesson banked.", "That’s a wrap!", "Nice work!"])}</h2>
    <p class="big-rounds">${roundsHtml(Math.max(was, round))}</p>
    <p><b>Round ${round} · ${esc(ROUNDS[round - 1].name)}</b> done. ${P.firstTry} of ${P.turns} right on the first try.</p>
    <p class="muted small">🔥 ${plural(st.current, "day")} in a row · ${plural(st.terms, "term")} learned</p>
    ${opened ? `<p class="note good">🔓 Level ${opened.n} is open: <b>${esc(opened.name)}</b>!</p>` : ""}
    ${nextR && round >= was ? `<p class="note">Next: <b>Round ${nextR} · ${esc(ROUNDS[nextR - 1].name)}</b>. ${esc(ROUNDS[nextR - 1].blurb)}</p>` : ""}
    ${learned.length ? `<h3>Terms you used</h3><ul class="learned">${learned.map((t) => `<li><b>${esc(t.t)}</b> <span class="muted">${esc(t.def)}</span></li>`).join("")}</ul>` : ""}
    <div class="row">
      ${nextR ? `<button type="button" class="btn primary" id="next-round">▶ Round ${nextR}</button>` : ""}
      <a class="btn ${nextR ? "" : "primary"}" href="#/skit/${next.id}">${nextR ? "" : "▶ "}${esc(next.title)}</a>
      <button type="button" class="btn" id="again">🔁 Again</button>
    </div>`;
  document.getElementById("convo").append(li);
  li.querySelector("#again").addEventListener("click", () => startSkit(skit, round));
  li.querySelector("#next-round")?.addEventListener("click", () => startSkit(skit, nextR));
  scrollDown(li);
  confetti(li.querySelector(".big-rounds"));
  syncSoon(true).then(() => {
    const c = S.cloud();
    if (!c.code || c.shown || !li.isConnected) return;
    S.setCloud({ shown: true });
    li.querySelector(".row")?.insertAdjacentHTML("beforebegin", `
      <div class="note savecode-new">
        <p>☁️ <b>Your progress now has a save code:</b></p>
        <p class="code-row"><b class="code big">${esc(c.code)}</b></p>
        <p class="small">📸 Take a screenshot. If this phone ever loses your progress, type the code in <b>Progress</b> to get everything back.</p>
      </div>`);
  });
}

// ───────────────────────── review ─────────────────────────

function viewReview() {
  const due = S.dueTerms(8);
  const all = S.terms();
  if (!all.length) {
    render(`<h1>Review</h1><p class="note">Reviews start after your first skit. Every term you get right comes back here after 1 day, then 3, 7, 14, 30 and 60. <a href="#/skit/${nextSkit().id}">Play a skit</a></p>`);
    return;
  }
  const upcoming = all.filter((p) => p.due > localDay()).sort((a, b) => (a.due < b.due ? -1 : 1));
  render(`
    <h1>Review</h1>
    <p class="lede">Quick quiz on the terms you’ve learned. Right on the first try and a term comes back later; miss it and it comes back tomorrow.</p>
    ${due.length ? `<p><button type="button" class="btn primary big" id="go">▶ Review ${plural(due.length, "term")}</button></p>`
      : `<p class="note good">✓ Nothing due today. Next review: <b>${upcoming[0] ? relativeFuture(upcoming[0].due) : "—"}</b>.</p>
         <p><button type="button" class="btn" id="practice">🔁 Practice anyway (doesn’t change your schedule)</button></p>`}
    <h2>How well you know them</h2>
    <div class="boxes">${[1, 2, 3, 4, 5, 6].map((b) => `<div class="box-col"><b>${all.filter((p) => (p.box ?? 1) === b).length}</b><span>${["New", "1 day", "3 days", "1 week", "2 weeks", "1–2 months"][b - 1]}</span></div>`).join("")}</div>`);
  document.getElementById("go")?.addEventListener("click", () => runQuiz(due, false));
  document.getElementById("practice")?.addEventListener("click", () => runQuiz(shuffle(all).slice(0, 8), true));
}

function relativeFuture(day) {
  const n = Math.round((new Date(`${day}T12:00`) - new Date(`${localDay()}T12:00`)) / 864e5);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

function runQuiz(items, practice) {
  S.markActive();
  const quiz = buildQuiz(items, allTerms());
  let i = 0, right = 0;
  const results = [];
  const show = () => {
    if (i >= quiz.length) {
      render(`<div class="finish solo"><h2>${right === quiz.length ? "Perfect!" : right ? "Nice work!" : "Keep at it!"}</h2>
        <p class="big-num">${right}<small>/${quiz.length}</small></p>
        <p>${practice ? "Practice round: your schedule didn’t change." : "The ones you missed come back tomorrow."}</p>
        <ul class="learned">${results.map((r) => `<li>${r.ok ? "✅" : "🔁"} <b>${esc(r.t)}</b></li>`).join("")}</ul>
        <div class="row"><a class="btn primary" href="#/">Skits</a><a class="btn" href="#/progress">Progress</a></div></div>`);
      if (right) confetti(app.querySelector(".big-num"));
      return;
    }
    const q = quiz[i];
    let tries = 0;
    render(`<div class="quiz">
      <p class="muted small">Review ${i + 1} of ${quiz.length}</p>
      <div class="bar" aria-hidden="true"><i style="width:${Math.round((i / quiz.length) * 100)}%"></i></div>
      <p class="ask">${esc(q.prompt)}</p>
      <div class="choices">${q.options.map((o, k) => `<button type="button" class="choice" data-k="${k}">${esc(o)}</button>`).join("")}</div>
      <div class="feedback" aria-live="polite"></div></div>`);
    app.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      const ok = q.options[+b.dataset.k] === q.right;
      tries++;
      b.classList.add(ok ? "right" : "wrong");
      b.disabled = true;
      if (!ok) { sfx.oops(); return; }
      sfx.right();
      const first = tries === 1;
      if (first) right++;
      results.push({ t: q.it.t, ok: first });
      if (!practice) S.reviewTerm(q.it.skit, q.it.t, first);
      const f = app.querySelector(".feedback");
      f.className = "feedback good";
      f.innerHTML = `<b>${esc(q.it.t)}:</b> ${esc(q.it.def)}<div class="row"><button type="button" class="btn primary small" data-next>Next ›</button></div>`;
      app.querySelectorAll(".choice").forEach((c) => { c.disabled = true; });
      app.querySelector("[data-next]").addEventListener("click", () => { i++; show(); });
    }));
  };
  show();
}

// ───────────────────────── progress ─────────────────────────

function viewProgress() {
  const st = S.stats();
  const tile = (icon, value, label, sub = "") => `<div class="tile"><span class="tile-icon" aria-hidden="true">${icon}</span><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
  render(`
    <h1>Progress</h1>
    ${savingNotice()}
    <div class="tiles">
      ${tile("🔥", st.current, "day streak", st.current && !st.practicedToday ? "practice today to keep it" : st.practicedToday ? "✓ practiced today" : "")}
      ${tile("🏆", st.longest, "best streak")}
      ${tile("📅", st.daysUsed, st.daysUsed === 1 ? "day used" : "days used")}
      ${tile("🕒", relativeDay(st.lastDay), "last practice")}
      ${tile("📘", st.terms, "terms learned", `<a href="#/terms">see them</a>`)}
      ${tile("✍️", st.answered, "questions answered")}
      ${tile("🎯", st.accuracy == null ? "–" : `${st.accuracy}%`, "right on first try")}
      ${tile("⭐", `${st.roundsDone}/${SKITS.length * 3}`, "rounds done")}
      ${tile("🔁", st.due, "to review", st.due ? `<a href="#/review">review now</a>` : "all caught up")}
    </div>
    <section class="panel backup">
      <h2>💾 Your progress</h2>
      ${codeBoxHtml()}
      <p class="small">It’s also saved in this browser. You can download a copy, or upload one from another device (it’s added to what’s here, nothing is erased).</p>
      <div class="row">
        <button type="button" class="btn small" data-backup="down">⬇ Download my progress</button>
        <label class="btn small">⬆ Upload progress<input type="file" accept="application/json,.json" data-backup="up" hidden></label>
      </div>
    </section>
    <h2>Practice calendar <small>last 15 weeks</small></h2>
    ${calendarHtml(S.activity())}
    <h2>Skits</h2>
    <table class="skit-table">
      <thead><tr><th scope="col">Skit</th><th scope="col">Rounds</th><th scope="col">Played</th></tr></thead>
      <tbody>${SKITS.map((s) => {
        const p = S.skitProgress(s.id);
        return `<tr><td>${levelUnlocked(s.level) ? `<a href="#/skit/${s.id}">${esc(s.title)}</a>` : `<span class="muted">${esc(s.title)} 🔒</span>`}<br><small class="muted">${esc(s.module)}</small></td>
          <td>${roundsHtml(p.rounds ?? 0)}</td><td class="num">${p.plays ? `${p.plays}×` : "—"}</td></tr>`;
      }).join("")}</tbody>
    </table>`);
  bindCodeBox(viewProgress);
  app.querySelector("[data-backup=down]").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([S.exportData()], { type: "application/json" }));
    a.download = `skit-stocks-progress-${localDay()}.json`;
    document.body.append(a); a.click(); a.remove();
    toast("Progress downloaded ✓");
  });
  app.querySelector("[data-backup=up]").addEventListener("change", async (e) => {
    try {
      const r = S.importData(await e.target.files[0].text());
      const bits = [r.rounds && plural(r.rounds, "round"), r.terms && plural(r.terms, "term"), r.days && plural(r.days, "day")].filter(Boolean);
      toast(bits.length ? `Progress added: ${bits.join(", ")} ✓` : "Uploaded ✓ — nothing new in that file", 4000);
      viewProgress();
    } catch (err) { toast(err.message, 5000); }
  });
}

function calendarHtml(days) {
  const today = localDay();
  const t = new Date(`${today}T12:00`);
  const end = addDays(today, 6 - ((t.getDay() + 6) % 7));
  const start = addDays(end, -15 * 7 + 1);
  const level = (n) => (!n ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4);
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const a = days[d];
    const n = a ? (a.answered ?? 0) + (a.reviews ?? 0) || 1 : 0;
    const label = `${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${a ? `${plural(a.answered ?? 0, "question")}${a.reviews ? `, ${a.reviews} reviewed` : ""}` : "no practice"}`;
    cells.push(d > today ? `<i class="cal-cell future"></i>` : `<i class="cal-cell l${level(n)}${d === today ? " today" : ""}" title="${esc(label)}" aria-label="${esc(label)}" role="img"></i>`);
  }
  return `<div class="cal" role="group" aria-label="Practice calendar">${cells.join("")}</div>
    <p class="cal-legend muted small">Less <i class="cal-cell l0"></i><i class="cal-cell l1"></i><i class="cal-cell l2"></i><i class="cal-cell l3"></i><i class="cal-cell l4"></i> More</p>`;
}

// ───────────────────────── terms (glossary) ─────────────────────────

function viewTerms() {
  const learned = new Set(S.terms().map((t) => `${t.skit}|${t.t}`));
  render(`
    <h1>Terms</h1>
    <p class="muted">Every term in the app. ✓ means you’ve gotten it right in a skit.</p>
    ${LEVELS.map((L) => `<section><h2>${L.n}. ${esc(L.name)}</h2>
      <dl class="glossary">${skitsInLevel(L.n).flatMap((s) => s.terms.map((t) => `<div class="${learned.has(`${s.id}|${t.t}`) ? "learned" : ""}"><dt>${learned.has(`${s.id}|${t.t}`) ? "✓ " : ""}${esc(t.t)}</dt><dd>${esc(t.def)}</dd></div>`)).join("")}</dl></section>`).join("")}`);
}

// ───────────────────────── settings ─────────────────────────

async function viewSettings() {
  const s = S.settings();
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  render(`
    <h1>Settings</h1>
    <section class="panel">
      <div class="toggles">
        <label><input type="checkbox" data-set="speak" ${s.speak ? "checked" : ""}> 🔊 Read the lines out loud</label>
        <label><input type="checkbox" data-set="sounds" ${s.sounds ? "checked" : ""}> 🔔 Sound effects</label>
        <label><input type="checkbox" data-set="unlockAll" ${s.unlockAll ? "checked" : ""}> 🔓 Open all levels</label>
      </div>
      <label class="field">Voice
        <select data-sel="ttsSource">
          ${opt("auto", "Automatic (natural AI voices when online)", s.ttsSource)}
          ${opt("server", "Always the AI voices", s.ttsSource)}
          ${opt("browser", "This device’s voice", s.ttsSource)}
        </select>
      </label>
      <label class="field">Device voice
        <select data-sel="browserVoice" id="bvoice"><option value="">Automatic</option></select>
      </label>
      <label class="field">Passcode <small class="muted">(only if the server has one)</small>
        <input type="password" data-text="passcode" value="${esc(s.passcode)}" autocomplete="off">
      </label>
      <p id="health" class="muted small">Checking…</p>
    </section>
    <section class="panel">
      <h2>Start over</h2>
      <p class="small">Erases progress on this device. Your online copy stays, so you could bring it back with your save code.</p>
      <button type="button" class="btn small danger" id="reset">Erase progress on this device</button>
    </section>
    <p class="muted small">For learning only. Not financial advice. Company names in the skits are made up.</p>`);
  app.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.set, el.checked)));
  app.querySelectorAll("[data-sel]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.sel, el.value)));
  app.querySelectorAll("[data-text]").forEach((el) => el.addEventListener("change", () => S.setSetting(el.dataset.text, el.value.trim())));
  const fill = () => {
    const sel = document.getElementById("bvoice");
    if (sel) sel.innerHTML = `<option value="">Automatic</option>` + browserVoices().map((v) => `<option value="${esc(v.name)}" ${v.name === s.browserVoice ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  };
  fill();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = fill;
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Erase all progress on this device?")) { S.resetProgress(); toast("Progress erased on this device"); }
  });
  const h = await health(true);
  const el = document.getElementById("health");
  if (el) el.textContent = h.judge ? "✅ Online: AI voices and the explanation checker are on." : "⚪ Offline: explanations are checked by keywords, and the device voice is used.";
}

// ───────────────────────── boot ─────────────────────────

document.addEventListener("click", (e) => {
  const sheet = document.getElementById("sheet");
  if (sheet?.classList.contains("show") && !sheet.contains(e.target) && !e.target.closest("[data-term]")) closeSheet();
});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// A link to the page you're already on (like ✕ in a skit) re-opens it; the browser alone wouldn't.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); route(); }
});
window.addEventListener("hashchange", route);
installClickSounds();
startSync();
onStatus(() => { const el = document.querySelector("[data-sync-status]"); if (el) el.textContent = syncLine(); });
route();
