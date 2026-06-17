/**
 * Anthropic (Claude) chat provider — native /v1/messages, zero-dep fetch.
 * Same interface as OpenAiCompatibleProvider: chat({messages, model, maxTokens}) → string.
 * Anthropic takes the system prompt separately and wants the first turn to be
 * "user", so we split system out and normalize the message list.
 */
export class AnthropicProvider {
  /** @param {{ apiKey: string, model?: string }} opts */
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model || "claude-sonnet-4-6";
  }

  /**
   * @param {{ messages: { role: string, content: string }[], model?: string, maxTokens?: number }} opts
   */
  async chat({ messages, model, maxTokens = 1024 }) {
    const system = (messages || [])
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? ""))
      .join("\n\n");

    const turns = [];
    for (const m of messages || []) {
      if (m.role === "system") continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content ?? "");
      if (!content) continue;
      const last = turns[turns.length - 1];
      if (last && last.role === role) last.content += "\n\n" + content; // merge consecutive same-role
      else turns.push({ role, content });
    }
    while (turns.length && turns[0].role !== "user") turns.shift(); // first turn must be user
    if (!turns.length) turns.push({ role: "user", content: "Hello" });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model || this.model,
        max_tokens: maxTokens,
        system: system || undefined,
        messages: turns
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic request failed (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
    if (!content) throw new Error("Empty Anthropic response");
    return content;
  }
}
