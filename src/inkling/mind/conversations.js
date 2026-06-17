/**
 * Inkling Mind — Layer 0: raw conversations (immutable, append-only).
 *
 * Every utterance (typed or voice) is captured here as the substrate the
 * abstraction pipeline later reads. Nothing here is ever edited.
 */
import { put, getAll, getAllByIndex, count, mindId } from "./db.js";

/** One session id per app load (a continuous conversation). */
let _sessionId = null;
export function currentSessionId() {
  if (!_sessionId) _sessionId = mindId("s");
  return _sessionId;
}

/**
 * Append one conversation turn (immutable).
 * @param {{ speaker: "user"|"inkling"|"system", content: string,
 *           source?: "text"|"voice", meta?: object }} turn
 * @returns {Promise<object|null>}
 */
export async function appendTurn(turn) {
  const content = (turn?.content || "").trim();
  if (!content || turn.speaker === "system") return null; // skip empty + system chrome
  const record = {
    id: mindId("c"),
    ts: Date.now(),
    sessionId: turn.sessionId || currentSessionId(),
    speaker: turn.speaker,
    content,
    source: turn.source || "text",
    meta: turn.meta || {}
  };
  try {
    await put("conversations", record);
  } catch {
    return null; // never let capture break the chat
  }
  return record;
}

/** Most recent turns (default 50), newest last. */
export async function recentTurns(limit = 50) {
  const all = await getAll("conversations");
  all.sort((a, b) => a.ts - b.ts);
  return limit ? all.slice(-limit) : all;
}

export async function turnsForSession(sessionId) {
  const rows = await getAllByIndex("conversations", "sessionId", sessionId);
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function conversationCount() {
  return count("conversations");
}
