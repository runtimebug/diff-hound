import { CodeReviewModel } from "../types";
import { OpenAIModel } from "./openai";
import { BaseReviewModel, LLMMessage } from "./base";

export { BaseReviewModel, LLMMessage };
export { OpenAIModel };

/**
 * Get model adapter for the specified AI model
 * @param provider The provider of the AI model (e.g., openai, anthropic, deepseek)
 * @param model The specific model to use (e.g., gpt-3.5-turbo, gpt-4)
 * @param endpoint Optional custom endpoint URL
 * @returns Model adapter instance
 */
export function getModel(
  provider: string,
  model: string,
  endpoint?: string
): CodeReviewModel {
  switch (provider) {
    case "openai":
      return new OpenAIModel(model, endpoint);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
