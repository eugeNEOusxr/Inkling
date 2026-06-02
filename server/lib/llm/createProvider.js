import { OpenAiCompatibleProvider } from "./providers/OpenAiCompatibleProvider.js";
import { MockLlmProvider } from "./providers/MockLlmProvider.js";
import { LlmService } from "./LlmService.js";

/**
 * LLM_PROVIDER=openai|mock
 * OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
 */
export function createLlmServiceFromEnv() {
  const kind = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;

  if (kind === "mock" || (!apiKey && kind === "auto")) {
    return new LlmService(new MockLlmProvider());
  }

  if (apiKey) {
    return new LlmService(
      new OpenAiCompatibleProvider({
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL,
        model: process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini"
      })
    );
  }

  return new LlmService(new MockLlmProvider());
}
