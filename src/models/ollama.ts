import { ReviewConfig } from "../types";
import { BaseReviewModel, LLMMessage } from "./base";

/**
 * Ollama /api/chat response shape (non-streaming)
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama model adapter for code review.
 * Uses the local Ollama HTTP API with JSON format for structured output.
 */
export class OllamaModel extends BaseReviewModel {
  private model: string;
  private endpoint: string;

  constructor(model: string, endpoint?: string) {
    super();
    if (!model) {
      throw new Error("Model is required");
    }
    this.model = model;
    this.endpoint = endpoint || "http://localhost:11434";
  }

  /**
   * Get the model name for this adapter
   */
  protected getModelName(): string {
    return `Ollama (${this.model})`;
  }

  /**
   * Ollama uses format: "json" which guarantees valid JSON syntax
   * but does NOT enforce schema. The base class parseStructuredResponse()
   * handles validation and falls back to legacy parsing if needed.
   */
  protected supportsStructuredOutput(): boolean {
    return true;
  }

  /**
   * Make an LLM API call to the local Ollama instance
   * @param messages Array of messages to send to the LLM
   * @param config Review configuration
   * @returns Raw response string from the LLM
   */
  protected async callLLM(
    messages: LLMMessage[],
    config: ReviewConfig
  ): Promise<string> {
    const timeoutMs = config.requestTimeout ?? 120_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages,
          format: "json",
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 4000,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as OllamaChatResponse;
      const content = data.message?.content;

      if (!content) {
        throw new Error("No response content from Ollama");
      }

      return content;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `Ollama request timed out after ${timeoutMs / 1000}s. ` +
            `The model may be too slow for this diff size. ` +
            `Try a smaller model or reduce the diff.`
        );
      }

      if (
        error instanceof TypeError &&
        (error.message.includes("fetch") ||
          error.message.includes("ECONNREFUSED"))
      ) {
        throw new Error(
          `Cannot connect to Ollama at ${this.endpoint}. ` +
            `Is Ollama running? Start it with: ollama serve`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
