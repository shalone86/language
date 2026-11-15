import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { newCode, cleanCode } from "../worker/index.js";
import { inAppBrowser } from "../public/js/progress.js";

// A fake Workers KV.
const kv = () => {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v, o) => { m.set(k, v); kv.lastOpts = o; } };
};
const call = (env, method, path, body) =>
  worker.fetch(new Request(`https://x${path}`, { method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, {});
const progress = { skits: { taqueria: { rounds: 2 } }, days: { "2026-11-14": { lines: 5 } }, words: {}, phrases: {} };

test("save codes are long, random-looking and easy to type back", () => {
  const c = newCode();
  assert.match(c, /^OSO-[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/); // no 0/O/1/I/L look-alikes
  assert.notEqual(newCode(), newCode());
  assert.equal(cleanCode(" oso 7kq2m rx4pa "), "OSO-7KQ2M-RX4PA");
  assert.equal(cleanCode("7KQ2MRX4PA"), "OSO-7KQ2M-RX4PA");
  assert.equal(cleanCode("OSO-123"), null);
});

test("create, read back and update progress under a code", async () => {
  const env = { PROGRESS: kv() };
  const made = await call(env, "POST", "/api/progress", progress);
  assert.equal(made.status, 200);
  const { code } = await made.json();
  assert.match(code, /^OSO-/);
  assert.equal(kv.lastOpts.expirationTtl, 60 * 60 * 24 * 400);

  const got = await call(env, "GET", `/api/progress/${code.toLowerCase()}`); // codes work in any case
  assert.equal(got.status, 200);
  assert.deepEqual(await got.json(), progress);

  const newer = { ...progress, skits: { taqueria: { rounds: 3 } } };
  assert.equal((await call(env, "PUT", `/api/progress/${code}`, newer)).status, 200);
  assert.equal((await (await call(env, "GET", `/api/progress/${code}`)).json()).skits.taqueria.rounds, 3);
});

test("unknown codes, bad codes and bad bodies are refused", async () => {
  const env = { PROGRESS: kv() };
  assert.equal((await call(env, "GET", "/api/progress/OSO-22222-22222")).status, 404);
  assert.equal((await call(env, "PUT", "/api/progress/OSO-22222-22222", progress)).status, 404); // codes are only made by POST
  assert.equal((await call(env, "GET", "/api/progress/hello")).status, 400);
  assert.equal((await call(env, "POST", "/api/progress", "not json")).status, 400);
  assert.equal((await call(env, "POST", "/api/progress", { nope: 1 })).status, 400);
  assert.equal((await call(env, "POST", "/api/progress", { skits: {}, big: "x".repeat(300 * 1024) })).status, 400);
});

test("progress endpoints respect the passcode and say when storage isn't set up", async () => {
  assert.equal((await call({ PROGRESS: kv(), APP_PASSCODE: "s" }, "POST", "/api/progress", progress)).status, 401);
  assert.equal((await call({}, "POST", "/api/progress", progress)).status, 503);
});

test("in-app browsers are spotted; normal browsers are not", () => {
  const fbMessenger = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0]";
  const instagram = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  assert.equal(inAppBrowser(fbMessenger), true);
  assert.equal(inAppBrowser(instagram), true);
  assert.equal(inAppBrowser(safari), false);
  assert.equal(inAppBrowser(chrome), false);
});
