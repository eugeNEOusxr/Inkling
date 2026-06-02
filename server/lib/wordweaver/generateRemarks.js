import crypto from "node:crypto";
import { createLlmServiceFromEnv } from "../llm/createProvider.js";
import { ruleBasedRemarksFromContext } from "./ruleBasedRemarks.js";

const llm = createLlmServiceFromEnv();

const SYSTEM_PROMPT = `You are WordWeaver, a thoughtful calendar companion inside Inkling.
Given a user's day context (notes, appointments, reminders), produce short, personal insights.
Use calendar dates: surface deadlines more urgently as they approach.
Respond ONLY with valid JSON:
{
  "remarks": [
    {
      "text": "one sentence insight",
      "segment": "morning" | "afternoon" | "night",
      "importance": 0.0 to 1.0,
      "category": "deadline" | "reflection" | "tip" | "followup" | "progress"
    }
  ]
}
Max 6 remarks. Be warm, specific, and concise. No markdown.`;

/**
 * @param {object} dayContext
 * @returns {Promise<{ remarks: object[], source: string }>}
 */
export async function generateWordWeaverRemarks(dayContext) {
  const userPayload = JSON.stringify({
    date: dayContext.date,
    weekday: dayContext.weekday,
    items: dayContext.items,
    summary: dayContext.summary
  });

  try {
    const raw = await llm.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload }
      ],
      maxTokens: 700
    });
    const parsed = JSON.parse(raw);
    const remarks = Array.isArray(parsed?.remarks) ? parsed.remarks : [];
    const cleaned = remarks
      .filter((r) => r?.text && typeof r.text === "string")
      .slice(0, 8)
      .map((r) => ({
        text: String(r.text).slice(0, 280),
        segment: ["morning", "afternoon", "night"].includes(r.segment) ? r.segment : "afternoon",
        importance: Math.min(1, Math.max(0, Number(r.importance) || 0.5)),
        category: String(r.category || "tip")
      }));
    if (cleaned.length) {
      return { remarks: cleaned, source: parsed.source === "mock" ? "mock" : "llm" };
    }
  } catch (err) {
    console.warn("[wordweaver/remarks] LLM failed, using rules:", err.message);
  }

  return { remarks: ruleBasedRemarksFromContext(dayContext), source: "rules" };
}

/**
 * @param {object} dayContext
 */
export function hashDayContext(dayContext) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(dayContext.items || []))
    .digest("hex")
    .slice(0, 16);
}

/**
 * @param {object} user
 * @param {string} date
 * @param {string} contextHash
 */
export function getCachedRemarks(user, date, contextHash) {
  const entry = user.wordweaverRemarksCache?.[date];
  if (!entry || entry.hash !== contextHash) return null;
  if (Date.now() - entry.generatedAt > 6 * 60 * 60 * 1000) return null;
  return entry;
}

/**
 * @param {object} user
 * @param {string} date
 * @param {string} contextHash
 * @param {object} payload
 */
export function setCachedRemarks(user, date, contextHash, payload) {
  user.wordweaverRemarksCache = user.wordweaverRemarksCache || {};
  user.wordweaverRemarksCache[date] = {
    hash: contextHash,
    generatedAt: Date.now(),
    ...payload
  };
}
