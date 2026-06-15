import { apiFetch } from "../../auth/cloudSync.js";
import { getSession } from "../../auth/session.js";
import { runLocalInklingChat } from "./inklingChatLocal.js";

/**
 * ChatGPT-style Inkling turn — server LLM when signed in, rich local chat otherwise.
 * @param {{
 *   message: string,
 *   history?: { role: 'user'|'assistant', content: string }[],
 *   referenceDate?: string,
 *   scheduleSummary?: string,
 *   userName?: string,
 *   awaitingConfirm?: boolean
 * }} payload
 */
export async function fetchInklingChat(payload) {
  // Always try the server LLM first — the /api/inkling/chat route is public, so
  // guests get the real AI too (when the server has an API key). Falls back to
  // the local router only if the request fails (offline / server down).
  try {
    const body = await apiFetch("/api/inkling/chat", {
      method: "POST",
      body: JSON.stringify({
        message: payload.message,
        history: payload.history ?? [],
        referenceDate: payload.referenceDate,
        scheduleSummary: payload.scheduleSummary ?? "",
        userName: payload.userName ?? ""
      })
    });
    if (body?.reply != null || body?.action) {
      return body;
    }
  } catch (err) {
    console.warn("[Inkling] chat API:", err?.message || err);
  }

  const local = runLocalInklingChat(payload);
  if (local.reply) {
    local.source = local.source === "local" ? "local-fallback" : local.source;
    return local;
  }

  return {
    reply:
      "I'm having trouble connecting. Check that you're signed in and the server is running, then try again.",
    action: "none",
    source: "error"
  };
}
