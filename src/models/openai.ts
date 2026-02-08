import OpenAI from "openai";
import { ReviewConfig } from "../types";
import { BaseReviewModel, LLMMessage } from "./base";

// Import the JSON schema for OpenAI
import reviewResponseSchema from "../schemas/review-response.json";

/**
 * OpenAI model adapter for code review
 * Uses structured JSON output via response_format for reliable parsing
 */
export class OpenAIModel extends BaseReviewModel {
  private client: OpenAI;
  private model: string;
  private endpoint?: string;

  constructor(model: string, endpoint?: string) {
    super();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    if (!model) {
      throw new Error("Model is required");
    }

    this.model = model;
    this.endpoint = endpoint;
    this.client = new OpenAI({
      apiKey,
      baseURL: endpoint,
    });
  }

  /**
   * Get the model name for this adapter
   */
  protected getModelName(): string {
    return `OpenAI (${this.model})`;
  }

  /**
   * OpenAI supports structured JSON output via response_format
   */
  protected supportsStructuredOutput(): boolean {
    return true;
  }

  /**
   * Make an LLM API call to OpenAI
   * @param messages Array of messages to send to the LLM
   * @param _config Review configuration (unused but kept for interface consistency)
   * @returns Raw response string from the LLM
   */
  protected async callLLM(
    messages: LLMMessage[],
    _config: ReviewConfig
  ): Promise<string> {
    // Use structured output with JSON schema
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: 0.1,
      max_tokens: 4000,
      store: true,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "review_response",
          description: "Structured code review response",
          schema: reviewResponseSchema,
          strict: true,
        },
      },
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    return content;
  }
}
