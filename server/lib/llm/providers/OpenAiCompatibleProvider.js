/**
 * OpenAI-compatible chat completions (OpenAI, Groq, Together, local LM Studio, etc.).
 */
export class OpenAiCompatibleProvider {
  /**
   * @param {{ apiKey: string, baseUrl?: string, model?: string }} opts
   */
  constructor({ apiKey, baseUrl, model }) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "https://api.openai.com").replace(/\/$/, "");
    this.model = model || "gpt-4o-mini";
  }

  /**
   * @param {{ messages: { role: string, content: string }[], model?: string, maxTokens?: number }} opts
   */
  async chat({ messages, model, maxTokens = 600 }) {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model || this.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.65
        // NOTE: no response_format json_object — the Inkling prompt wants a
        // conversational reply followed by a trailing JSON footer, which JSON
        // mode would strip (leaving an empty reply).
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM request failed (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");
    return content;
  }
}
