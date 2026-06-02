/**
 * Provider-agnostic LLM facade (OpenAI-compatible, Anthropic via proxy, etc.).
 */
export class LlmService {
  /**
   * @param {{ chat: (opts: { messages: { role: string, content: string }[], model?: string, maxTokens?: number }) => Promise<string> }} provider
   */
  constructor(provider) {
    this.provider = provider;
  }

  /**
   * @param {{ messages: { role: string, content: string }[], model?: string, maxTokens?: number }} opts
   */
  async chat(opts) {
    return this.provider.chat(opts);
  }
}
