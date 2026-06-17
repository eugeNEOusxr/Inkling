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
/**
 * True when the server reply is actually the mock provider's WordWeaver-remarks
 * JSON leaking through (no API key configured), e.g. `{"remarks":[],"source":"mock"}`.
 * @param {any} body
 */
function looksLikeMockLeak(body) {
  if (body?.source === "mock") return true;
  const r = body?.reply;
  if (typeof r !== "string") return false;
  const t = r.trim();
  if (!(t.startsWith("{") && t.endsWith("}"))) return false;
  try {
    const o = JSON.parse(t);
    return !!o && typeof o === "object" && (o.source === "mock" || "remarks" in o);
  } catch {
    return false;
  }
}

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
        userName: payload.userName ?? "",
        mindSummary: payload.mindSummary ?? ""
      })
    });
    // Guest (not signed in) → paid AI is gated; use the free local router instead
    // of the empty server reply so guests still get a real answer.
    if (body?.source === "guest") {
      // fall through to runLocalInklingChat below
    } else if ((body?.reply != null || body?.action) && !looksLikeMockLeak(body)) {
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
