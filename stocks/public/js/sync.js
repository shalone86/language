// The online copy of progress, under a save code (no accounts).
//
// Some phones throw away browser storage: private tabs, browsers set to clear data on exit,
// and the built-in browsers of apps like Messenger or Instagram. So a copy of the progress
// is kept on the server under a code like OSO-7KQ2M-RX4PA. If this device loses its progress,
// typing the code brings it back (and the same code moves progress to another device).
//
// After each change (debounced) we fetch the online copy, merge it in, and upload the result,
// so two devices using the same code add up instead of overwriting each other.

import * as S from "./store.js";

const DEBOUNCE_MS = 3000;
const headers = (json) => ({ ...(json ? { "content-type": "application/json" } : {}), ...(S.settings().passcode ? { "x-app-passcode": S.settings().passcode } : {}) });

let timer = null, running = null, again = false;
const watchers = new Set();
/** { state: "idle" | "saving" | "saved" | "offline", at, error } */
export const status = { state: "idle", at: null, error: null };
export function onStatus(fn) { watchers.add(fn); return () => watchers.delete(fn); }
function setStatus(state, error = null) {
  Object.assign(status, { state, error, at: state === "saved" ? Date.now() : status.at });
  for (const fn of watchers) { try { fn(status); } catch { /* ignore */ } }
}

async function fetchCopy(code) {
  const r = await fetch(`api/progress/${encodeURIComponent(code)}`, { headers: headers(), cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Merge the online copy in, then upload. Creates a code the first time there's progress. */
async function syncNow() {
  if (!S.hasProgress() && !S.cloud().code) return;
  setStatus("saving");
  let code = S.cloud().code;
  const online = code ? await fetchCopy(code) : null;
  if (!online) {
    // First save, or the online copy expired (400 days unused): make a new code.
    const r = await fetch("api/progress", { method: "POST", headers: headers(true), body: S.snapshot() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    ({ code } = await r.json());
    S.setCloud({ code, savedAt: Date.now(), shown: false });
    setStatus("saved");
    return;
  }
  S.mergeIn(online);
  const r = await fetch(`api/progress/${encodeURIComponent(code)}`, { method: "PUT", headers: headers(true), body: S.snapshot() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  S.setCloud({ savedAt: Date.now() });
  setStatus("saved");
}

/** Run a sync now (coalescing overlapping calls). Never throws. */
export async function syncSoon(immediately = false) {
  clearTimeout(timer);
  if (!immediately) { timer = setTimeout(() => syncSoon(true), DEBOUNCE_MS); return; }
  if (running) { again = true; return running; }
  running = syncNow().catch((e) => setStatus("offline", e.message)).finally(() => {
    running = null;
    if (again) { again = false; syncSoon(); }
  });
  return running;
}

/**
 * Bring progress back from a save code (merged with whatever is on this device), and keep
 * syncing to that code from now on. Returns the summary from S.importData. Throws a readable error.
 */
export async function restore(rawCode) {
  const code = String(rawCode ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^OSO/, "");
  if (code.length !== 10) throw new Error("A save code has 10 letters and numbers after OSO, like OSO-7KQ2M-RX4PA.");
  const full = `OSO-${code.slice(0, 5)}-${code.slice(5)}`;
  let text;
  try { text = await fetchCopy(full); } catch { throw new Error("Couldn’t reach the server. Check your connection and try again."); }
  if (!text) throw new Error("No progress was found for that code. Check the letters and try again.");
  const summary = S.importData(text);
  S.setCloud({ code: full, shown: true, savedAt: Date.now() });
  syncSoon(true);
  return summary;
}

/** Start syncing: after every change, when the app is put away, and when the connection comes back. */
export function startSync() {
  S.onSave(() => syncSoon());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncSoon(true); });
  window.addEventListener("online", () => syncSoon(true));
  if (S.cloud().code || S.hasProgress()) syncSoon(true);
}
