import { ruleBasedRemarksFromContext } from "../../wordweaver/ruleBasedRemarks.js";
import { INKLING_CHAT_MARKER } from "../../inkling/inklingConstants.js";

/** Dev fallback when no API key — returns JSON matching the LLM contract. */
export class MockLlmProvider {
  async chat({ messages }) {
    // The mock serves two very different consumers. For Inkling CHAT (system
    // prompt carries the chat marker) it must NOT return remarks JSON — that
    // leaks raw `{"remarks":[],"source":"mock"}` into the chat bubble. Signal
    // "no real LLM" so the caller hands off to the local intent-router instead.
    const isChat = messages.some(
      (m) => m.role === "system" && String(m.content || "").includes(INKLING_CHAT_MARKER)
    );
    if (isChat) {
      return JSON.stringify({ noLlm: true, source: "mock" });
    }

    const user = messages.find((m) => m.role === "user")?.content || "{}";
    let ctx;
    try {
      ctx = JSON.parse(user);
    } catch {
      ctx = { date: "today", items: [] };
    }
    const remarks = ruleBasedRemarksFromContext(ctx);
    return JSON.stringify({ remarks, source: "mock" });
  }
}
