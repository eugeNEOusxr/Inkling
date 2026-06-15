import { createLlmServiceFromEnv } from "../llm/createProvider.js";
import { parseInklingLlmJson } from "./parseInklingLlmJson.js";
import { INKLING_CHAT_MARKER } from "./inklingConstants.js";
import { buildCommandLanguagePromptForLlm } from "./inklingCommandLexicon.js";

// Lazy so the API key from .env (loaded at server start) is read on first use,
// not at import time.
let _llm = null;
function getLlm() {
  return (_llm ||= createLlmServiceFromEnv());
}

const COMMAND_LANGUAGE_BLOCK = buildCommandLanguagePromptForLlm();

const SYSTEM_PROMPT = `${INKLING_CHAT_MARKER}
You are Inkling — a warm, capable AI assistant inside the Inkling calendar app. You chat like ChatGPT: natural, clear, and helpful in multi-turn conversation.

You help with:
- Everyday chat and follow-ups (remember what the user said earlier in the thread)
- Structured COMMAND LANGUAGE (see below) — never treat command jargon as casual chat
- Notes: "jot down", "Inkling log this", "capture this note", "put in my notes"
- Schedule questions: "what's on tomorrow", "Inkling show my upcoming schedule"
- Free time: "when am I free", "any openings Friday afternoon"
- Adding items: appointments, reminders, alarms, timed notes, tasks (always propose — the app confirms before saving)

You know Inkling also has Notebook Writer (hour timeline), WordWeaver (3D thoughts), and a 3D month calendar.

${COMMAND_LANGUAGE_BLOCK}

Personality: concise but not terse, friendly, no corporate jargon. You may use light markdown in reply (**bold**, lists) when it helps.

After your conversational reply, the app needs a machine-readable footer. End EVERY response with a JSON block on its own line (no code fence required but allowed):

{"action":"none"|"query_schedule"|"query_free_time"|"propose","proposal":null|{...},"query":null|{...}}

Rules for action:
- "none" — general chat, advice, clarifying questions, or you're not adding to the calendar
- "query_schedule" — user wants to see what's scheduled; set query: {"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}
- "query_free_time" — user asks when they're free; set query: {"date":"YYYY-MM-DD"}
- "propose" — user wants something saved; set proposal: {"kind":"note"|"appointment"|"reminder"|"alarm","date":"YYYY-MM-DD","time":"HH:MM","text":"..."}

Use referenceDate as "today". Interpret relative dates (tomorrow, Friday, next week) from referenceDate.
Never claim you already saved something — the user must confirm in the UI.`;

/**
 * @param {{
 *   message: string,
 *   history?: { role: string, content: string }[],
 *   referenceDate?: string,
 *   scheduleSummary?: string,
 *   userName?: string
 * }} payload
 */
export async function generateInklingChat(payload) {
  const ref = payload.referenceDate || new Date().toISOString().slice(0, 10);
  const messages = buildChatMessages(payload, ref);

  try {
    const raw = await getLlm().chat({
      messages,
      maxTokens: 1400
    });
    const parsed = splitReplyAndJson(raw);
    const out = normalizeInklingResponse(parsed, ref);
    out.source = "llm";
    return out;
  } catch (err) {
    console.warn("[inkling/chat] LLM failed:", err.message);
    return {
      reply:
        "I couldn't reach the AI service right now. Sign in for full ChatGPT-style chat, or try: \"what's on tomorrow\" or \"jot down Friday 2pm: call the pharmacy.\"",
      action: "none",
      proposal: null,
      query: null,
      source: "fallback"
    };
  }
}

/**
 * @param {object} payload
 * @param {string} ref
 */
function buildChatMessages(payload, ref) {
  /** @type {{ role: string, content: string }[]} */
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  const context = [
    `Today (referenceDate): ${ref}`,
    payload.userName ? `User display name: ${payload.userName}` : "",
    payload.scheduleSummary
      ? `Upcoming calendar items (sample):\n${payload.scheduleSummary}`
      : "No calendar items in the current view."
  ]
    .filter(Boolean)
    .join("\n");

  messages.push({ role: "system", content: context });

  for (const turn of (payload.history || []).slice(-24)) {
    const role = turn.role === "assistant" ? "assistant" : turn.role === "user" ? "user" : null;
    const content = String(turn.content ?? "").trim().slice(0, 3000);
    if (role && content) messages.push({ role, content });
  }

  messages.push({
    role: "user",
    content: String(payload.message).slice(0, 2000)
  });

  return messages;
}

/**
 * Split visible reply from trailing JSON footer.
 * @param {string} raw
 */
function splitReplyAndJson(raw) {
  const trimmed = String(raw ?? "").trim();
  const jsonLine = trimmed.match(/\{[\s\S]*"action"\s*:[\s\S]*\}$/);
  if (jsonLine) {
    const reply = trimmed.slice(0, trimmed.length - jsonLine[0].length).trim();
    try {
      const meta = parseInklingLlmJson(jsonLine[0]);
      return { reply: reply || meta.reply || "", meta };
    } catch {
      return { reply: trimmed, meta: { action: "none" } };
    }
  }

  const parsed = parseInklingLlmJson(trimmed);
  if (parsed.reply && parsed.action) {
    return { reply: parsed.reply, meta: parsed };
  }
  return { reply: trimmed, meta: parsed };
}

/**
 * @param {{ reply: string, meta: object }} parsed
 * @param {string} ref
 */
function normalizeInklingResponse(parsed, ref) {
  const meta = parsed.meta || {};
  const reply = String(parsed.reply || meta.reply || "").slice(0, 4000);
  const action = String(meta.action || "none");

  const out = {
    reply: reply || "I'm here — what would you like to talk about or add to your calendar?",
    action,
    proposal: null,
    query: null
  };

  if (action === "propose" && meta.proposal) {
    const p = meta.proposal;
    out.proposal = {
      kind: ["note", "appointment", "reminder", "alarm"].includes(p.kind) ? p.kind : "note",
      date: String(p.date || ref).slice(0, 10),
      time: normalizeTime(p.time),
      text: String(p.text || "Note").slice(0, 200)
    };
  }

  if (action === "query_schedule" && meta.query) {
    out.query = {
      startDate: String(meta.query.startDate || ref).slice(0, 10),
      endDate: String(meta.query.endDate || meta.query.startDate || ref).slice(0, 10)
    };
  }

  if (action === "query_free_time" && meta.query) {
    out.query = {
      date: String(meta.query.date || ref).slice(0, 10)
    };
  }

  return out;
}

function normalizeTime(time) {
  const raw = String(time ?? "09:00").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
