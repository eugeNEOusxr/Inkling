import { processUserInput } from "./AIBrain.js";
import { parseInklingMessage } from "./inklingParser.js";
import { buildConversationalReply } from "./inklingConversation.js";

/**
 * Offline / unsigned-in Inkling chat — same response shape as the API.
 * @param {{
 *   message: string,
 *   history?: { role: string, content: string }[],
 *   referenceDate?: string,
 *   userName?: string,
 *   awaitingConfirm?: boolean
 * }} opts
 */
export function runLocalInklingChat(opts) {
  const text = String(opts.message ?? "").trim();
  const userName = opts.userName ?? "";

  const brain = processUserInput(text, {
    history: opts.history,
    userName,
    awaitingConfirm: opts.awaitingConfirm ?? false,
    referenceDate: opts.referenceDate,
    sideThread: opts.sideThread
  });

  if (brain.action === "sideConversation" || brain.action === "askClarification") {
    return {
      reply: brain.aiResponse,
      action: "none",
      proposal: null,
      source: "local",
      brain
    };
  }

  if (brain.action === "openWriter") {
    return {
      reply: brain.aiResponse ?? "Opening Notebook Writer.",
      action: "open_writer",
      proposal: null,
      source: "local",
      brain
    };
  }

  if (brain.action === "openCalendar") {
    return {
      reply: brain.aiResponse ?? "Opening your calendar.",
      action: "open_calendar",
      proposal: null,
      source: "local",
      brain
    };
  }

  if (brain.action === "openWordWeaver") {
    return {
      reply: brain.aiResponse ?? "Opening the Calendar.",
      action: "open_wordweaver",
      proposal: null,
      source: "local",
      brain
    };
  }

  if (brain.action === "createAlert") {
    return {
      reply: brain.aiResponse ?? "Okay, I'll alert you.",
      action: "create_alert",
      proposal: {
        time: brain.payload?.time,
        text: brain.payload?.text,
        category: brain.payload?.category
      },
      source: "local",
      brain
    };
  }

  if (brain.action === "storeNote") {
    return {
      reply: null,
      action: "store_note",
      proposal: null,
      source: "local",
      brain
    };
  }

  const intent = parseInklingMessage(text, new Date(), {
    userName,
    awaitingConfirm: opts.awaitingConfirm ?? false
  });

  // Prefer an actionable calendar intent over a generic chat reply — otherwise
  // "lunch today at 1:30 with amanda" gets a conversational answer instead of
  // being added to the calendar.
  const actionableIntent =
    (intent.type === "propose_schedule" && intent.proposal) ||
    intent.type === "query_schedule" ||
    intent.type === "query_free_time";

  if (brain.aiResponse && !actionableIntent) {
    return {
      reply: brain.aiResponse,
      action: "none",
      proposal: null,
      source: "local",
      brain
    };
  }

  if (intent.type === "query_schedule") {
    return {
      reply: null,
      action: "query_schedule",
      query: { startDate: intent.date, endDate: intent.endDate ?? intent.date },
      source: "local"
    };
  }

  if (intent.type === "query_free_time") {
    return {
      reply: null,
      action: "query_free_time",
      query: { date: intent.date },
      source: "local"
    };
  }

  if (intent.type === "propose_schedule" && intent.proposal) {
    return {
      reply: intent.reply,
      action: "propose",
      proposal: intent.proposal,
      source: "local"
    };
  }

  if (intent.type === "delete_item") {
    return {
      reply: intent.reply,
      action: "none",
      source: "local"
    };
  }

  const lower = text.toLowerCase();
  const reply =
    intent.type === "chat" && intent.confidence === "high"
      ? intent.reply
      : buildConversationalReply(text, lower, {
          userName,
          history: opts.history,
          awaitingConfirm: opts.awaitingConfirm ?? false
        });

  return {
    reply,
    action: "none",
    proposal: null,
    source: "local"
  };
}
