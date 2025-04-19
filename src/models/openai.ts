import OpenAI from "openai";
import { CodeReviewModel, FileChange, AIComment, ReviewConfig } from "../types";

/**
 * OpenAI model adapter for code review
 */
export class OpenAIModel implements CodeReviewModel {
  private client: OpenAI;
  private model: string;

  constructor(model: string, endpoint?: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    if (!model) {
      throw new Error("Model is required");
    }

    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: endpoint,
    });
  }

  /**
   * Generate a code review prompt for the given diff
   * @param diff File changes to review
   * @param config Review configuration
   * @returns Prompt for the AI
   */
  private generatePrompt(diff: FileChange[], config: ReviewConfig): string {
    const rules =
      config.rules && config.rules.length > 0
        ? `\nApply these specific rules:\n${config.rules
            .map((rule) => `- ${rule}`)
            .join("\n")}`
        : "";

    const diffText = diff
      .map((file) => {
        return `File: ${file.filename} (${file.status})
${file.patch || "No changes"}
`;
      })
      .join("\n\n");

    return `
Only provide brief, actionable, file-specific feedback related to the actual code diff.
Do not include general advice, documentation-style summaries, or best practices unless they directly relate to the diff.
Use a direct tone. No greetings. No summaries. No repeated advice.

Important formatting rules:
- Do not comment on lines that are unchanged or just context unless it's directly impacted by a change.
${
  config.commentStyle === "inline"
    ? "- Output only inline comments, Use this format: 'filename.py:<line number in the new file> — comment'"
    : "- Provide a single short summary of your review."
}

${rules}

Here are the changes to review:

${diffText}

${config.customPrompt || ""}`;
  }

  /**
   * Parse the AI response into comments
   * @param response AI generated response
   * @param config Review configuration
   * @returns List of comments
   */
  private parseResponse(response: string, config: ReviewConfig): AIComment[] {
    const comments: AIComment[] = [];

    if (config.commentStyle === "summary") {
      // Generate a single summary comment
      comments.push({
        type: "summary",
        content: response.trim(),
        severity: config.severity,
      });
      return comments;
    }

    // Look for patterns like "filename.ext:123 — comment text"
    const inlineCommentRegex =
      /([\w/.-]+):(\d+)\s*[—–-]\s*(.*?)(?=\s+[\w/.-]+:\d+\s*[—–-]|$)/gs;
    let match;

    while ((match = inlineCommentRegex.exec(response + "\n\n")) !== null) {
      const [, path, lineStr, content] = match;
      const line = parseInt(lineStr, 10);

      comments.push({
        type: "inline",
        path,
        line,
        content: content.trim(),
        severity: config.severity,
      });
    }

    // If no inline comments were parsed, create a summary comment
    if (comments.length === 0) {
      comments.push({
        type: "summary",
        content: response.trim(),
        severity: config.severity,
      });
    }

    return comments;
  }

  /**
   * Review code changes and generate comments
   * @param diff File changes to review
   * @param config Review configuration
   * @returns List of AI comments
   */
  async review(diff: FileChange[], config: ReviewConfig): Promise<AIComment[]> {
    // Filter out ignored files
    if (config.ignoreFiles && config.ignoreFiles.length > 0) {
      diff = diff.filter((file) => {
        return !config.ignoreFiles?.some((pattern) => {
          // Basic glob pattern matching for *.ext
          if (pattern.startsWith("*") && pattern.indexOf(".") > 0) {
            const ext = pattern.substring(1);
            return file.filename.endsWith(ext);
          }
          return file.filename === pattern;
        });
      });
    }

    // Skip if no files to review
    if (diff.length === 0) {
      return [
        {
          type: "summary",
          content: "No files to review after applying ignore patterns.",
          severity: "suggestion",
        },
      ];
    }

    const prompt = this.generatePrompt(diff, config);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a senior software engineer doing a peer code review. Your job is to spot all logic, syntax, and semantic issues in a code diff.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        store: true,
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return this.parseResponse(content, config);
    } catch (error) {
      console.error("Error generating review with OpenAI:", error);
      throw error;
    }
  }
}
