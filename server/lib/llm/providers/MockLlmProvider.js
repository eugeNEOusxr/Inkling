import { ruleBasedRemarksFromContext } from "../../wordweaver/ruleBasedRemarks.js";

/** Dev fallback when no API key — returns JSON matching the LLM contract. */
export class MockLlmProvider {
  async chat({ messages }) {
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
