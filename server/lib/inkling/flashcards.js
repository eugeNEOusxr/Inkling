/**
 * Flashcard generator — Haiku turns a topic/section (+ its key terms) into a set
 * of question/answer cards. Pairs with Study Maps: each section (1.1, 1.2…) gets
 * its own deck. Returns null without ANTHROPIC_API_KEY.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.FLASHCARD_MODEL || "claude-haiku-4-5";

const SYSTEM =
  "You write study flashcards. Given a topic, a section, and key terms, produce a focused deck. " +
  "Respond with ONLY a JSON object — no prose, no code fences. Shape: " +
  '{"cards":[{"q":"<question>","a":"<answer>"}]}. ' +
  "Rules: 6–12 cards. q is a clear question that tests understanding or recall of the section; " +
  "a is a correct, concise answer (1–3 sentences, plain text, no markdown). Cover the listed terms. " +
  "Vary question types (define, apply, compare, give an example).";

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
    .map((c) => ({ q: String(c?.q || "").trim().slice(0, 400), a: String(c?.a || "").trim().slice(0, 800) }))
    .filter((c) => c.q && c.a)
    .slice(0, 14);
  if (!cards.length) return null;
  return { cards, source: "haiku" };
}
