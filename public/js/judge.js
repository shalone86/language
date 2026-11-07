// "Does this reply make sense here?" — used in round 3 (no words on screen) and in reviews,
// where any sensible Spanish reply counts, not just the line from the script.
// The Worker sends the prompt to an LLM on Workers AI; this file builds the prompt and reads
// the answer. Shared by the Worker and the tests (pure functions, no DOM).

export const JUDGE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Check and trim what the browser sent. Returns null if it's unusable. */
export function cleanJudgeRequest(b) {
  if (!b || typeof b !== "object") return null;
  const said = clip(b.said, 300);
  if (!said) return null;
  return {
    scene: clip(b.scene, 300),
    country: clip(b.country, 40),
    context: (Array.isArray(b.context) ? b.context : []).slice(-4).map((l) => ({ who: clip(l?.who, 30), es: clip(l?.es, 300) })).filter((l) => l.es),
    intent: clip(b.intent, 200),
    expected: (Array.isArray(b.expected) ? b.expected : []).slice(0, 4).map((e) => clip(e, 300)).filter(Boolean),
    said,
  };
}

export function judgeMessages(r) {
  const system = [
    "You check one reply from a learner of Spanish in a short role-play. The learner is practicing everyday spoken Spanish and slang from " + (r.country || "Latin America") + ".",
    "Decide if the reply makes sense as the learner's next line in this conversation.",
    "Say ok=true when: it is Spanish (slang, regional words and small grammar mistakes are fine), it answers or fits what the other person just said, and it fits the situation. It does NOT have to match the suggested line or mean exactly the same.",
    "Say ok=false when: it is mostly English or another language, it is unrelated to the conversation, it is a fragment that says nothing, or it would confuse the other person.",
    "The reply came from speech-to-text, so ignore spelling, accents and punctuation.",
    "Answer with JSON only, no other text: {\"ok\": true or false, \"note\": \"one short, friendly sentence in English for the learner\"}.",
  ].join("\n");
  const user = [
    r.scene && `Situation: ${r.scene}`,
    r.context.length && `Conversation so far:\n${r.context.map((l) => `${l.who}: ${l.es}`).join("\n")}`,
    r.intent && `What the learner meant to say (English): ${r.intent}`,
    r.expected.length && `Suggested line: ${r.expected.join(" / ")}`,
    `Learner said: "${r.said}"`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Read the model's answer (an object, or text with JSON somewhere in it). Returns {ok, note} or null. */
export function parseJudge(out) {
  let v = out?.response ?? out;
  if (typeof v === "string") {
    const m = v.match(/\{[\s\S]*\}/);
    if (!m) {
      if (/^\s*(true|yes|s[ií])\b/i.test(v)) return { ok: true, note: "" };
      if (/^\s*(false|no)\b/i.test(v)) return { ok: false, note: "" };
      return null;
    }
    try { v = JSON.parse(m[0]); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const ok = v.ok === true || v.ok === "true" || v.makes_sense === true;
  const okFalse = v.ok === false || v.ok === "false";
  if (!ok && !okFalse) return null;
  return { ok, note: clip(v.note ?? v.reason ?? "", 200) };
}
