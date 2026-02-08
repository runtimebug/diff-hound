import OpenAI from "openai";
import { CodeReviewModel, FileChange, AIComment, ReviewConfig } from "../types";
import {
  StructuredReviewResponse,
  toAIComment,
  CommentSeverity,
} from "../schemas/review-response";
import {
  parseStructuredResponse,
  looksLikeStructuredResponse,
} from "../schemas/validate";

// Import the JSON schema for OpenAI
import reviewResponseSchema from "../schemas/review-response.json";

/**
 * OpenAI model adapter for code review
 * Uses structured JSON output via response_format for reliable parsing
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
Review the following code changes and provide specific, actionable feedback.

Output your response as a JSON object matching this structure:
{
  "summary": "Brief overall assessment (optional)",
  "comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|warning|suggestion|nitpick",
      "category": "bug|security|performance|style|architecture|testing",
      "confidence": 0.95,
      "title": "One-line summary of the issue (max 80 chars)",
      "explanation": "Detailed explanation of why this is an issue",
      "suggestion": "Optional: suggested fix or improvement"
    }
  ]
}

Severity levels:
- critical: Bugs, security vulnerabilities, or data loss risks
- warning: Potential issues or code smells
- suggestion: Improvements that would be nice to have
- nitpick: Minor style preferences

Categories:
- bug: Logic errors, incorrect behavior
- security: Security vulnerabilities, unsafe practices
- performance: Performance bottlenecks, inefficiencies
- style: Code style, formatting, naming
- architecture: Design patterns, code organization
- testing: Test coverage, test quality

Important rules:
- Only comment on lines that are part of the diff (added or modified)
- Do not comment on unchanged context lines unless directly impacted
- Be specific and actionable in your feedback
- Use direct, professional tone
- Include a suggestion when you can provide a concrete improvement
${rules}

Here are the changes to review:

${diffText}

${config.customPrompt || ""}`;
  }

  /**
   * Parse the AI response into comments
   * Supports both structured JSON and legacy free-text format for backward compatibility
   * @param response AI generated response
   * @param config Review configuration
   * @returns List of comments
   */
  private parseResponse(response: string, config: ReviewConfig): AIComment[] {
    // Try structured JSON parsing first
    if (looksLikeStructuredResponse(response)) {
      const result = parseStructuredResponse(response);
      if (result.success && result.data) {
        return this.convertStructuredResponse(result.data, config);
      }
      // If structured parsing fails, fall through to legacy parsing
      console.warn(
        "Structured response parsing failed, falling back to legacy parsing:",
        result.error
      );
    }

    // Legacy free-text parsing (fallback)
    return this.parseLegacyResponse(response, config);
  }

  /**
   * Convert structured response to AIComment array
   */
  private convertStructuredResponse(
    response: StructuredReviewResponse,
    config: ReviewConfig
  ): AIComment[] {
    const comments: AIComment[] = [];

    // Add summary comment if present
    if (response.summary) {
      comments.push({
        type: "summary",
        content: response.summary,
        severity: config.severity,
      });
    }

    // Convert structured comments to AIComment format
    for (const structuredComment of response.comments) {
      // Apply severity filtering
      const severityOrder: CommentSeverity[] = [
        "critical",
        "warning",
        "suggestion",
        "nitpick",
      ];
      const minSeverity = (config.severity as CommentSeverity) || "suggestion";
      const commentSeverityIndex = severityOrder.indexOf(structuredComment.severity);
      const minSeverityIndex = severityOrder.indexOf(minSeverity);

      // Skip comments below the minimum severity threshold
      if (commentSeverityIndex > minSeverityIndex) {
        continue;
      }

      // Apply confidence filtering (default min: 0.6)
      const minConfidence = 0.6;
      if (structuredComment.confidence < minConfidence) {
        continue;
      }

      const aiComment = toAIComment(structuredComment);
      comments.push(aiComment);
    }

    return comments;
  }

  /**
   * Legacy free-text response parsing (fallback mode)
   */
  private parseLegacyResponse(response: string, config: ReviewConfig): AIComment[] {
    const comments: AIComment[] = [];

    if (config.commentStyle === "summary") {
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
      // Use structured output with JSON schema
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a senior software engineer doing a peer code review. Your job is to spot all logic, syntax, and semantic issues in a code diff. Always respond with valid JSON matching the requested schema.",
          },
          { role: "user", content: prompt },
        ],
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

      return this.parseResponse(content, config);
    } catch (error) {
      console.error("Error generating review with OpenAI:", error);
      throw error;
    }
  }
}
