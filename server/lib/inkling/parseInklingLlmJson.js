/**
 * Parse Inkling LLM output — strict JSON or markdown-wrapped / plain text fallback.
 * @param {string} raw
 */
export function parseInklingLlmJson(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { reply: "", action: "none" };

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try next */
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* continue */
      }
    }
  }

  return { reply: trimmed, action: "none" };
}
