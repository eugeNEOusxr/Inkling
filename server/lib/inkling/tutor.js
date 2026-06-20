/**
 * Tutor — Haiku helpers for the quiz:
 *  • explainLLM: a worked, step-by-step solution for a question (+ follow-up chat).
 *  • gradeLLM:  judges whether a short free-text answer is an acceptable match.
 * Returns null without ANTHROPIC_API_KEY.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.TUTOR_MODEL || process.env.QUIZ_MODEL || "claude-haiku-4-5";

function headers(key) {
  return { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
}
function textOf(data) {
  return (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("").trim();
}

const EXPLAIN_SYS =
  "You are a warm, concise tutor helping a student understand a practice question. Explain how to REACH the " +
  "answer step by step so they learn the method, not just the result. Use short numbered steps. Plain text only " +
  "— no markdown headers, no LaTeX; write math plainly (x^2, sqrt(x), <=, pi). Keep it tight (under ~150 words) " +
  "unless the student asks for more. If they ask a follow-up, answer it directly and stay on topic.";

// Progressive-hint modes: keep the student working — never hand over the answer early.
const MODE_SYS = {
  nudge:
    " HINT MODE: The student wants only a SMALL NUDGE to get unstuck. Give ONE or two sentences pointing at the " +
    "key idea, formula, or first thing to notice. Do NOT reveal the final answer and do NOT work through the steps.",
  step:
    " HINT MODE: Give ONLY the FIRST concrete step (and briefly why), then STOP. Do not complete the solution and " +
    "do not state the final answer — leave the rest for the student."
};

/**
 * @param {{ question?: string, answer?: string, history?: {role:string,content:string}[], mode?: string }} opts
 */
export async function explainLLM({ question, answer, history, mode } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  const q = String(question || "").trim();
  if (!key) return null;
  const system = EXPLAIN_SYS + (MODE_SYS[mode] || "");

  const messages = [];
  if (Array.isArray(history) && history.length) {
    for (const h of history.slice(-8)) {
      if (h && (h.role === "user" || h.role === "assistant") && h.content) {
        messages.push({ role: h.role, content: String(h.content).slice(0, 2000) });
      }
    }
  }
  if (!messages.length) {
    if (!q) return null;
    messages.push({
      role: "user",
      content:
        "Question: " + q.slice(0, 700) +
        (answer != null && String(answer).trim() ? "\nThe correct answer is: " + String(answer).slice(0, 200) : "") +
        "\n\nWalk me through how to solve it."
    });
  }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages })
    });
    if (!res.ok) { console.warn(`[inkling/explain] ${res.status}`); return { source: "error" }; }
    const reply = textOf(await res.json());
    return reply ? { reply, source: "haiku" } : { source: "none" };
  } catch (err) {
    console.warn("[inkling/explain] exception:", err?.message || err);
    return { source: "error" };
  }
}

const GRADE_SYS =
  "You grade a student's short answer to a quiz question. Mark it correct if it is right OR an acceptable " +
  "equivalent — synonyms, alternate valid phrasings, or trivial spelling/case differences. Be fair but accurate; " +
  "do NOT accept a different concept. Respond with ONLY JSON: {\"correct\": true|false, \"note\": \"<=12 words\"}.";

/**
 * @param {{ question?: string, expected?: string, given?: string }} opts
 */
export async function gradeLLM({ question, expected, given } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || expected == null || !String(given || "").trim()) return null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        model: MODEL, max_tokens: 120, system: GRADE_SYS,
        messages: [{
          role: "user",
          content:
            "Question: " + String(question || "").slice(0, 500) +
            "\nExpected answer: " + String(expected).slice(0, 200) +
            "\nStudent answer: " + String(given).slice(0, 200)
        }]
      })
    });
    if (!res.ok) { console.warn(`[inkling/grade] ${res.status}`); return { source: "error" }; }
    const raw = textOf(await res.json());
    let obj = null;
    try { const a = raw.indexOf("{"), b = raw.lastIndexOf("}"); if (a > -1 && b > a) obj = JSON.parse(raw.slice(a, b + 1)); } catch { /* ignore */ }
    return { correct: !!(obj && obj.correct), note: obj?.note ? String(obj.note).slice(0, 80) : "", source: "haiku" };
  } catch (err) {
    console.warn("[inkling/grade] exception:", err?.message || err);
    return { source: "error" };
  }
}
