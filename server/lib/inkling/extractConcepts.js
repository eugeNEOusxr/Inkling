/**
 * Stage 2b — LLM concept extraction via Claude Haiku (native Anthropic API).
 *
 * Turns free-form text into graph concepts + relations, so the Mind can map ANY
 * phrasing, not just the local lexicon. Zero-dep: raw fetch to /v1/messages.
 * Returns null when ANTHROPIC_API_KEY is unset (the client falls back to the
 * local heuristic extractor), so nothing breaks and guests cost nothing.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.MIND_EXTRACT_MODEL || "claude-haiku-4-5";

const SYSTEM =
  "You extract concepts for a personal knowledge graph from a single message. " +
  "Respond with ONLY a JSON object — no prose, no code fences. Shape: " +
  '{"concepts":[{"label":string,"type":"subject"|"concept"|"project"|"event"|"goal"|"person"|"place"|"emotion"}],' +
  '"relations":[[labelA,labelB]]}. ' +
  "Labels are short Title Case noun phrases (1–4 words), canonical and reusable " +
  "(e.g. \"Precalculus\", \"Sleep\", \"Chemical Reactions\"). Skip filler, pronouns, and one-off chatter. " +
  "relations connect two labels that are meaningfully related in THIS message; only use labels you listed. " +
  "If nothing meaningful, return {\"concepts\":[],\"relations\":[]}.";

export async function extractConceptsLLM(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  const clean = String(text || "").trim();
  if (!key) return null; // no key → route reports source:"none"
  if (clean.length < 3) return { concepts: [], relations: [], source: "haiku" };
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: "user", content: clean.slice(0, 4000) }]
      })
    });
    if (!res.ok) {
      // Key present but the API rejected us — surface the status so we can tell
      // a bad key (401) from a model-access issue (403/404) without leaking it.
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message || e?.error?.type || ""; } catch { /* ignore */ }
      return { concepts: [], relations: [], source: "error", status: res.status, detail: String(detail).slice(0, 200), model: MODEL };
    }
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    return normalize(parseJson(raw));
  } catch (err) {
    return { concepts: [], relations: [], source: "error", detail: String(err?.message || err).slice(0, 120) };
  }
}

function parseJson(s) {
  if (!s) return null;
  let t = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

function normalize(obj) {
  if (!obj || typeof obj !== "object") return null;
  const concepts = (Array.isArray(obj.concepts) ? obj.concepts : [])
    .map((c) => ({ label: String(c?.label || "").trim().slice(0, 40), type: String(c?.type || "concept") }))
    .filter((c) => c.label && c.label.length >= 2);
  const labels = new Set(concepts.map((c) => c.label.toLowerCase()));
  const relations = (Array.isArray(obj.relations) ? obj.relations : [])
    .filter((r) => Array.isArray(r) && r.length === 2)
    .filter((r) => labels.has(String(r[0]).toLowerCase()) && labels.has(String(r[1]).toLowerCase()))
    .map((r) => [String(r[0]).trim(), String(r[1]).trim()]);
  if (!concepts.length) return { concepts: [], relations: [] };
  return { concepts: concepts.slice(0, 20), relations: relations.slice(0, 40), source: "haiku" };
}
