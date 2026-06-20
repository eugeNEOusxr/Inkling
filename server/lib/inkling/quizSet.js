/**
 * Quiz-set generator — Haiku turns a topic/section into a GRADED quiz deck that
 * renders in quiz.html (NOT flat flashcards). Emits the quiz schema:
 *   { "questions": [
 *       { "type":"mc", "prompt":"…", "options":["…",…], "correct":<0-based index> },
 *       { "type":"multiinput", "prompt":"…",
 *         "blanks":[ { "label":"…", "answer": <number | "expr" | "interval">, "answerText":"…"? } ] }
 *   ] }
 * Without ANTHROPIC_API_KEY it returns a small mock deck so the pipe still works.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.QUIZ_MODEL || process.env.FLASHCARD_MODEL || "claude-haiku-4-5";

const SYSTEM =
  "You write GRADED practice quizzes on ANY subject — math, biology, chemistry, physics, history, " +
  "language, etc. Respond with ONLY a JSON object — no prose, no code fences. Shape: " +
  '{"questions":[ {"type":"mc","prompt":"<question>","options":["<a>","<b>","<c>","<d>"],"correct":<0-based index of the correct option>}, ' +
  '{"type":"multiinput","prompt":"<question>","blanks":[{"label":"<short label>","answer":<see rules>}]} ]}. ' +
  "Rules:\n" +
  "- 8–12 questions. EVERY question MUST be type \"mc\" or \"multiinput\" — no other types. At LEAST half must be \"mc\".\n" +
  "- Favor concrete, test-it questions; vary them so the learner practices real understanding, not one memorized fact.\n" +
  "- mc: 3–4 plausible options, exactly ONE correct; \"correct\" is the 0-based index into options " +
  "(put the right answer at a RANDOM position, not always first).\n" +
  "- multiinput \"answer\" must be SHORT and unambiguous so it can be auto-graded by exact/equivalent match. " +
  "Pick the form that fits the subject:\n" +
  "    • a single WORD or short TERM for a factual answer (e.g. \"mitochondria\", \"photosynthesis\", \"1492\", \"oxygen\");\n" +
  "    • a NUMBER (e.g. 5, -2, 1.5, or a fraction like \"2/3\") for a computed value;\n" +
  "    • an ALGEBRAIC EXPRESSION (e.g. \"6x+12\", \"x^2-6x+10\") for math simplify/expand (any equivalent form is accepted);\n" +
  "    • an INTERVAL (e.g. \"(-infinity, 3]\", \"[0, infinity)\") for math domain/range/solution sets.\n" +
  "  Use ONE blank for a single answer (keep word/term answers to ~1–3 words). Prefer mc for facts that have " +
  "long or open-ended answers, so multiinput stays short and exactly matchable.\n" +
  "- Plain text ONLY — NO markdown, NO LaTeX. For math write x^2, sqrt(x), <=, pi, infinity.\n" +
  "- Make every question self-contained and unambiguous.";

const DIFFICULTY = {
  easy: "EASY tier — single-step, foundational recall/application; keep it gentle and confidence-building.",
  medium: "MEDIUM tier — standard, grade-level multi-step problems.",
  hard: "HARD tier — challenging, multi-concept, exam/competition level; push the learner."
};

export async function generateQuizSetLLM({ topic, section, terms, difficulty } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  const t = String(topic || "").trim();
  if (t.length < 2) return null;
  if (!key) return mockQuizSet(t, section);
  const ask =
    `Topic: ${t.slice(0, 120)}\n` +
    (section ? `Section: ${String(section).slice(0, 120)}\n` : "") +
    (DIFFICULTY[difficulty] ? `Difficulty: ${DIFFICULTY[difficulty]}\n` : "") +
    (Array.isArray(terms) && terms.length
      ? `Key terms: ${terms.slice(0, 20).map((x) => String(x).slice(0, 60)).join(", ")}`
      : "");
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2400, system: SYSTEM, messages: [{ role: "user", content: ask }] })
    });
    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message || e?.error?.type || ""; } catch { /* ignore */ }
      console.warn(`[inkling/quiz-set] ${res.status} ${MODEL}: ${detail}`);
      return { source: "error", status: res.status };
    }
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    const out = normalize(raw, t, section);
    if (out && out.questions && out.questions.length) {
      out.questions = await verifyAnswers(out.questions, t, key);
      out.verified = true;
    }
    return out || { source: "none" };
  } catch (err) {
    console.warn("[inkling/quiz-set] exception:", err?.message || err);
    return { source: "error" };
  }
}

// Second-pass self-check: independently re-solve each question and correct any
// wrong answer key. Conservative — only trusts the review if it returns the same
// number of valid questions; otherwise keeps the originals. Never blocks output.
const VERIFY_SYS =
  "You are a meticulous answer-key checker. You receive quiz questions (JSON) with proposed answers. " +
  "Independently SOLVE each question and return the corrected set as ONLY a JSON object {\"questions\":[…]}. " +
  "Keep the SAME order, count, types, prompts, and mc options. For each, set the correct \"correct\" (0-based " +
  "index for mc) or \"answer\" (for multiinput), changing it ONLY when the proposed answer is actually wrong. " +
  "Keep multiinput answers in their original form (number, algebraic expression, single word/term, or interval). " +
  "Be especially careful with math. No commentary.";
async function verifyAnswers(questions, topic, key) {
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 2600, system: VERIFY_SYS,
        messages: [{ role: "user", content: `Topic: ${topic}\n${JSON.stringify({ questions })}` }]
      })
    });
    if (!res.ok) return questions;
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    const obj = parseJson(raw);
    const fixed = (Array.isArray(obj?.questions) ? obj.questions : []).map(normalizeQuestion).filter(Boolean);
    return fixed.length === questions.length ? fixed : questions;
  } catch (err) {
    console.warn("[inkling/quiz-set] verify failed:", err?.message || err);
    return questions;
  }
}

function parseJson(s) {
  if (!s) return null;
  const t = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** Coerce raw model JSON into validated quiz questions (drops malformed ones). */
function normalize(raw, topic, section) {
  const obj = parseJson(raw);
  const src = Array.isArray(obj?.questions) ? obj.questions : [];
  const questions = [];
  for (const q of src) {
    const nq = normalizeQuestion(q);
    if (nq) questions.push(nq);
    if (questions.length >= 12) break;
  }
  if (questions.length < 3) return null;
  return { questions, topic, section: section || "", source: "haiku" };
}

function normalizeQuestion(q) {
  if (!q || typeof q !== "object") return null;
  const prompt = String(q.prompt || "").trim().slice(0, 400);
  if (!prompt) return null;
  if (q.type === "mc") {
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).slice(0, 200)).filter(Boolean);
    if (options.length < 2) return null;
    let correct = Number(q.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) correct = 0;
    return { type: "mc", prompt, options, correct, points: 10 };
  }
  if (q.type === "multiinput" || q.type === "input" || q.type === "numeric" || q.type === "fill") {
    const bsrc = Array.isArray(q.blanks)
      ? q.blanks
      : (q.answer != null ? [{ label: q.label, answer: q.answer, answerText: q.answerText }] : []);
    const blanks = [];
    for (const b of bsrc) {
      if (b == null || b.answer == null) continue;
      let ans = b.answer;
      if (typeof ans === "string") {
        ans = ans.trim().slice(0, 120);
        if (/^-?\d+(\.\d+)?$/.test(ans)) ans = parseFloat(ans);
      } else if (typeof ans !== "number") {
        continue;
      }
      const nb = { label: String(b.label || "Answer =").slice(0, 80), answer: ans };
      if (b.answerText != null) nb.answerText = String(b.answerText).slice(0, 120);
      blanks.push(nb);
    }
    if (!blanks.length) return null;
    return { type: "multiinput", prompt, blanks, points: 10 };
  }
  return null;
}

/** Key-less fallback: a few valid questions so the loop is testable without Haiku. */
function mockQuizSet(topic, section) {
  return {
    source: "mock",
    topic,
    section: section || "",
    questions: [
      { type: "mc", prompt: `(Demo set for “${topic}”.) Which expression is written in simplest form?`,
        options: ["3x + 5", "2x + x + 5", "x + x + x + 5", "5 + 3x − 0"], correct: 0, points: 10 },
      { type: "multiinput", prompt: "Demo: Evaluate 3(4) − 2.",
        blanks: [{ label: "=", answer: 10 }], points: 10 },
      { type: "multiinput", prompt: "Demo: Expand (x + 1)(x + 4).",
        blanks: [{ label: "=", answer: "x^2+5x+4", answerText: "x² + 5x + 4" }], points: 10 },
      { type: "multiinput", prompt: "Demo: State the domain of f(x) = sqrt(x − 2) in interval notation.",
        blanks: [{ label: "Domain:", answer: "[2,infinity)", answerText: "[2, ∞)" }], points: 10 }
    ]
  };
}
