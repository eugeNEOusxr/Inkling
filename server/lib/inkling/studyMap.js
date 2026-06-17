/**
 * Study Map generator — Haiku turns ANY topic into a universal study hierarchy:
 * Topic → branches (chapters/units) → leaves (knowable terms). Domain-agnostic
 * (math, writing, music, law…). Returns null without ANTHROPIC_API_KEY.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.STUDYMAP_MODEL || "claude-haiku-4-5";

const SYSTEM =
  "You build study maps. Given a topic, break it into a clear learning hierarchy and respond with ONLY " +
  "a JSON object — no prose, no code fences. Shape: " +
  '{"topic":"<canonical topic name>","branches":[{"label":"<branch/chapter>","leaves":["<term>", ...]}]}. ' +
  "Rules: 5–12 branches; 3–10 leaves per branch. Leaves are short, specific, checkable terms a learner would " +
  "know-or-not (e.g. \"Domain and Range\", \"Hard vs Soft Magic\"), Title Case, no numbering unless the source " +
  "uses it. Order branches the way the subject is normally taught. If a well-known curriculum/textbook is named " +
  "(e.g. \"OpenStax Precalculus\"), follow its actual table of contents.";

export async function generateStudyMapLLM(topic) {
  const key = process.env.ANTHROPIC_API_KEY;
  const clean = String(topic || "").trim();
  if (!key || clean.length < 2) return null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Topic: ${clean.slice(0, 200)}` }]
      })
    });
    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message || e?.error?.type || ""; } catch { /* ignore */ }
      console.warn(`[inkling/studymap] ${res.status} ${MODEL}: ${detail}`);
      return { source: "error", status: res.status };
    }
    const data = await res.json();
    const raw = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    return normalize(raw, clean);
  } catch (err) {
    console.warn("[inkling/studymap] exception:", err?.message || err);
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

function normalize(raw, fallbackTopic) {
  const obj = parseJson(raw);
  if (!obj) return null;
  const branches = (Array.isArray(obj.branches) ? obj.branches : [])
    .map((br) => ({
      label: String(br?.label || "").trim().slice(0, 80),
      leaves: (Array.isArray(br?.leaves) ? br.leaves : [])
        .map((l) => String(l || "").trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 12)
    }))
    .filter((br) => br.label && br.leaves.length)
    .slice(0, 14);
  if (!branches.length) return null;
  return { topic: String(obj.topic || fallbackTopic).trim().slice(0, 80), branches, source: "haiku" };
}
