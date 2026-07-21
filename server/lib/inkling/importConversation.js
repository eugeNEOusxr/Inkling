/**
 * Extension import processor — turns a captured AI conversation into knowledge:
 * a short summary, extracted concepts + relations (for the knowledge graph), and
 * a graded quiz deck the user can study in quiz.html.
 *
 * Reuses the existing Haiku helpers (extractConceptsLLM, generateQuizSetLLM) and
 * degrades to a mock summary when ANTHROPIC_API_KEY is unset, so the endpoint
 * always returns something useful and stays testable offline. Zero-dep.
 */
import { extractConceptsLLM } from "./extractConcepts.js";
import { generateQuizSetLLM } from "./quizSet.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.IMPORT_MODEL || "claude-haiku-4-5";

/** Flatten a Conversation's messages into a plain transcript for the model. */
function toTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((m) => `${m.role === "assistant" ? "AI" : m.role === "user" ? "User" : m.role}: ${String(m.markdown || "").trim()}`)
    .filter((l) => l.length > 5)
    .join("\n\n")
    .slice(0, 12000);
}

/** 2–4 sentence abstract of the conversation (Haiku), or a template without a key. */
async function summarizeLLM(title, transcript) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || transcript.length < 20) {
    return `Imported conversation “${title}”. (Set ANTHROPIC_API_KEY on the server for an AI-written summary.)`;
  }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system:
          "You summarize a chat between a user and an AI assistant for a personal knowledge base. " +
          "Write 2–4 plain sentences: what was discussed and the key takeaways. No preamble, no markdown.",
        messages: [{ role: "user", content: `Title: ${title}\n\n${transcript}` }],
      }),
    });
    if (!res.ok) return `Imported conversation “${title}”.`;
    const data = await res.json();
    const text = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("").trim();
    return text || `Imported conversation “${title}”.`;
  } catch {
    return `Imported conversation “${title}”.`;
  }
}

/** Lenient JSON extraction from a model reply (strips fences/prose). */
function parseJson(s) {
  if (!s) return null;
  const t = String(s).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/**
 * Condense a conversation into a SHORT dialogue — a "conversation piece" of
 * 3–6 exchanges that captures the arc, so it's quicker to re-read than the full
 * transcript. Returns [{role:"user"|"assistant", text}] or null.
 */
async function digestLLM(title, transcript) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || transcript.length < 40) return null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system:
          "Condense a user↔AI conversation into a SHORT dialogue that captures its arc and key insights — " +
          "3 to 6 exchanges, each 1–2 sentences, kept in the speakers' voices (not a summary paragraph). " +
          'Respond with ONLY JSON: {"digest":[{"role":"user"|"assistant","text":"…"}]}. No preamble, no markdown.',
        messages: [{ role: "user", content: `Title: ${title}\n\n${transcript}` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    const arr = Array.isArray(parseJson(raw)?.digest) ? parseJson(raw).digest : [];
    const out = arr
      .map((d) => ({ role: d.role === "assistant" ? "assistant" : "user", text: String(d.text || "").trim().slice(0, 320) }))
      .filter((d) => d.text)
      .slice(0, 6);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Process one captured conversation. Never throws — each stage degrades to a
 * safe default so the caller can always return a 200 result.
 * @returns {Promise<object>} import result
 */
export async function processImport(conversation) {
  const messages = conversation?.messages || [];
  const title = String(conversation?.source?.title || "Conversation").slice(0, 200);
  const provider = String(conversation?.source?.provider || "unknown");
  const transcript = toTranscript(messages);
  const importId = "imp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Run the stages in parallel; tolerate any individual failure.
  const [summary, extracted, digest] = await Promise.all([
    summarizeLLM(title, transcript),
    extractConceptsLLM(transcript).catch(() => null),
    digestLLM(title, transcript).catch(() => null),
  ]);
  const concepts = extracted?.concepts || [];
  const relations = extracted?.relations || [];

  // A graded quiz deck built from the concepts, studyable in quiz.html.
  let quiz = null;
  let quizSource = null;
  try {
    const terms = concepts.map((c) => c.label).slice(0, 18);
    const qs = await generateQuizSetLLM({ topic: title, terms });
    quizSource = qs?.source || null;
    if (qs && Array.isArray(qs.questions) && qs.questions.length) {
      quiz = { id: importId, title: `From: ${title}`.slice(0, 80), questions: qs.questions };
    }
  } catch {
    quiz = null;
  }

  const usedAi = extracted?.source === "haiku" || quizSource === "haiku";
  return {
    ok: true,
    importId,
    status: "complete",
    provider,
    title,
    messageCount: messages.length,
    summary,
    digest,
    concepts,
    relations,
    quiz,
    source: usedAi ? "haiku" : "mock",
  };
}
