/**
 * Flashcard generator — Haiku turns a topic/section (+ its key terms) into a set
 * of question/answer cards. Pairs with Study Maps: each section (1.1, 1.2…) gets
 * its own deck. Returns null without ANTHROPIC_API_KEY.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.FLASHCARD_MODEL || "claude-haiku-4-5";

const SYSTEM =
  "You write study flashcards that build real mastery — not just definition recall. Given a topic, a section, " +
  "and key terms, produce a focused deck. Respond with ONLY a JSON object — no prose, no code fences. Shape: " +
  '{"cards":[{"q":"<question>","a":"<answer>","type":"problem"|"concept"}]}. ' +
  "Rules:\n" +
  "- 8–12 cards. At least HALF must be type \"problem\": concrete, solve-it questions with specific numbers or " +
  "cases (e.g. \"Find the domain of f(x)=sqrt(x-3)\", \"Factor x^2-5x+6\", \"Evaluate f(2) for f(x)=3x^2-1\"). " +
  "VARY the numbers and cases across problems so the learner practices the method, not one memorized instance.\n" +
  "- The rest are type \"concept\": define, compare, or give-an-example questions that test understanding.\n" +
  "- Answers (a): for problems, show the key step(s) and the final answer (concise). For concepts, a correct " +
  "1–3 sentence answer. Plain text only — NO markdown, NO LaTeX; write math plainly (x^2, sqrt(x), <=, pi).\n" +
  "- Cover the listed terms; prefer application over restatement.";

export async function generateFlashcardsLLM({ topic, section, terms } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  const t = String(topic || "").trim();
  if (!key || t.length < 2) return null;
  const ask =
    `Topic: ${t.slice(0, 120)}\n` +
    (section ? `Section: ${String(section).slice(0, 120)}\n` : "") +
    (Array.isArray(terms) && terms.length ? `Key terms: ${terms.slice(0, 20).map((x) => String(x).slice(0, 60)).join(", ")}` : "");
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, system: SYSTEM, messages: [{ role: "user", content: ask }] })
    });
    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message || e?.error?.type || ""; } catch { /* ignore */ }
      console.warn(`[inkling/flashcards] ${res.status} ${MODEL}: ${detail}`);
      return { source: "error", status: res.status };
    }
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    return normalize(raw);
  } catch (err) {
    console.warn("[inkling/flashcards] exception:", err?.message || err);
    return { source: "error" };
  }
}

function parseJson(s) {
  if (!s) return null;
  let t = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

function normalize(raw) {
  const obj = parseJson(raw);
  const cards = (Array.isArray(obj?.cards) ? obj.cards : [])
    .map((c) => ({
      q: String(c?.q || "").trim().slice(0, 400),
      a: String(c?.a || "").trim().slice(0, 800),
      type: c?.type === "problem" ? "problem" : "concept"
    }))
    .filter((c) => c.q && c.a)
    .slice(0, 14);
  if (!cards.length) return null;
  return { cards, source: "haiku" };
}
