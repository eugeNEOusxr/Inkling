import { OpenAiCompatibleProvider } from "./providers/OpenAiCompatibleProvider.js";
import { AnthropicProvider } from "./providers/AnthropicProvider.js";
import { MockLlmProvider } from "./providers/MockLlmProvider.js";
import { LlmService } from "./LlmService.js";

/**
 * LLM_PROVIDER=anthropic|openai|mock  (default: auto)
 * auto → Claude when ANTHROPIC_API_KEY is set, else OpenAI-compatible, else mock.
 * ANTHROPIC_API_KEY, ANTHROPIC_CHAT_MODEL (default claude-sonnet-4-6)
 * OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
 */
export function createLlmServiceFromEnv() {
  const kind = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;

  if (kind === "mock") return new LlmService(new MockLlmProvider());

  if ((kind === "anthropic" || kind === "auto") && anthropicKey) {
    return new LlmService(
      new AnthropicProvider({ apiKey: anthropicKey, model: process.env.ANTHROPIC_CHAT_MODEL })
    );
  }

  if (kind !== "anthropic" && openaiKey) {
    return new LlmService(
      new OpenAiCompatibleProvider({
        apiKey: openaiKey,
        baseUrl: process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL,
        model: process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini"
      })
    );
  }

  return new LlmService(new MockLlmProvider());
}
