import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanJudgeRequest, judgeMessages, parseJudge } from "../public/js/judge.js";
import worker from "../worker/index.js";

const req = {
  scene: "At a taco stand", country: "México",
  context: [{ who: "Don Chuy", es: "¿Para aquí o para llevar?" }],
  intent: "For here.", expected: ["Para aquí."], said: "Aquí nomás, gracias",
};

test("judge requests are trimmed and need something said", () => {
  assert.equal(cleanJudgeRequest(null), null);
  assert.equal(cleanJudgeRequest({ said: "   " }), null);
  const r = cleanJudgeRequest({ ...req, said: "x".repeat(999), context: Array(10).fill({ who: "A", es: "hola" }) });
  assert.equal(r.said.length, 300);
  assert.equal(r.context.length, 4);
});

test("the prompt carries the conversation, the intent and what was said", () => {
  const [sys, user] = judgeMessages(cleanJudgeRequest(req));
  assert.equal(sys.role, "system");
  assert.match(sys.content, /JSON/);
  assert.match(sys.content, /does NOT have to match/);
  assert.match(user.content, /Don Chuy: ¿Para aquí o para llevar\?/);
  assert.match(user.content, /Learner said: "Aquí nomás, gracias"/);
});

test("model answers are read as JSON, inside text, or as objects", () => {
  assert.deepEqual(parseJudge({ response: '{"ok": true, "note": "Natural!"}' }), { ok: true, note: "Natural!" });
  assert.deepEqual(parseJudge({ response: 'Sure: {"ok": false, "note": "That is English."} hope it helps' }), { ok: false, note: "That is English." });
  assert.deepEqual(parseJudge({ response: { ok: true, note: "" } }), { ok: true, note: "" });
  assert.deepEqual(parseJudge({ response: "true" }), { ok: true, note: "" });
  assert.equal(parseJudge({ response: "I am not sure" }), null);
  assert.equal(parseJudge({ response: '{"maybe": 1}' }), null);
});

const env = (answer) => ({
  AI: { run: async (model, input) => { env.last = { model, input }; return answer; } },
  ASSETS: { fetch: () => new Response("asset") },
});

test("POST /api/judge returns the verdict", async () => {
  const e = env({ response: '{"ok": true, "note": "Sounds local."}' });
  const r = await worker.fetch(new Request("https://x/api/judge", { method: "POST", body: JSON.stringify(req) }), e, {});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, note: "Sounds local." });
  assert.match(env.last.model, /llama/);
  assert.equal(env.last.input.messages.length, 2);
});

test("POST /api/judge rejects empty requests and unreadable answers", async () => {
  const bad = await worker.fetch(new Request("https://x/api/judge", { method: "POST", body: "{}" }), env({}), {});
  assert.equal(bad.status, 400);
  const garbled = await worker.fetch(new Request("https://x/api/judge", { method: "POST", body: JSON.stringify(req) }), env({ response: "hmm" }), {});
  assert.equal(garbled.status, 502);
});

test("the passcode also protects /api/judge", async () => {
  const e = { ...env({ response: '{"ok":true}' }), APP_PASSCODE: "secreto" };
  const r = await worker.fetch(new Request("https://x/api/judge", { method: "POST", body: JSON.stringify(req) }), e, {});
  assert.equal(r.status, 401);
});
