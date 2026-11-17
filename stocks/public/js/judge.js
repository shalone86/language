// "Does this explanation show they understand?" — used in round 3 (say it your way).
// The Worker sends the prompt to an LLM on Workers AI; this file builds the prompt and reads
// the answer. Shared by the Worker and the tests (pure functions, no DOM).

export const JUDGE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Check and trim what the browser sent. Returns null if it's unusable. */
export function cleanJudgeRequest(b) {
  if (!b || typeof b !== "object") return null;
  const said = clip(b.said, 600);
  if (!said) return null;
  return {
    topic: clip(b.topic, 120),
    question: clip(b.question, 300),
    model: clip(b.model, 500),
    keys: (Array.isArray(b.keys) ? b.keys : []).slice(0, 8).map((k) => clip(Array.isArray(k) ? k.join(" / ") : k, 80)).filter(Boolean),
    said,
  };
}

export function judgeMessages(r) {
  const system = [
    "You grade one short answer from a student learning investing and the stock market. Be encouraging but honest.",
    "ok=true when the answer shows they understand the main idea, even in casual words, slang, or with small gaps. It does not need to match the model answer's wording.",
    "ok=false when the main idea is wrong, missing, off-topic, or too vague to show understanding (like 'it's good' or 'I don't know').",
    "The answer may come from speech-to-text, so ignore spelling and punctuation.",
    "Never give investment advice. Only judge the explanation.",
    "Answer with JSON only: {\"ok\": true or false, \"note\": \"one short, friendly sentence. If ok=false, say the key thing they missed.\"}",
  ].join("\n");
  const user = [
    r.topic && `Topic: ${r.topic}`,
    r.question && `Question: ${r.question}`,
    r.model && `A good answer: ${r.model}`,
    r.keys.length && `Key ideas (not all required): ${r.keys.join("; ")}`,
    `Student answered: "${r.said}"`,
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Read the model's answer (an object, or text with JSON somewhere in it). Returns {ok, note} or null. */
export function parseJudge(out) {
  let v = out?.response ?? out;
  if (typeof v === "string") {
    const m = v.match(/\{[\s\S]*\}/);
    if (!m) {
      if (/^\s*(true|yes)\b/i.test(v)) return { ok: true, note: "" };
      if (/^\s*(false|no)\b/i.test(v)) return { ok: false, note: "" };
      return null;
    }
    try { v = JSON.parse(m[0]); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const ok = v.ok === true || v.ok === "true";
  const okFalse = v.ok === false || v.ok === "false";
  if (!ok && !okFalse) return null;
  return { ok, note: clip(v.note ?? v.reason ?? "", 240) };
}
