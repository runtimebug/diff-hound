import {
  CodeReviewModel,
  FileChange,
  AIComment,
  ReviewConfig,
} from "../types";
import {
  toAIComment,
  CommentSeverity,
} from "../schemas/review-response";
import {
  parseStructuredResponse,
  looksLikeStructuredResponse,
} from "../schemas/validate";

/**
 * Message format for LLM conversations
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Abstract base class for model adapters.
 * Providers share ~70% of logic (prompt gen, parsing, filtering).
 * Provider-specific implementations only need to implement:
 * - callLLM(): Make the actual API call to the LLM
 * - supportsStructuredOutput(): Whether the provider supports JSON schema output
 */
export abstract class BaseReviewModel implements CodeReviewModel {
  /**
   * Make an LLM API call with the given messages.
   * Provider-specific implementations handle authentication, request formatting,
   * and response extraction.
   * @param messages Array of messages to send to the LLM
   * @param config Review configuration
   * @returns Raw response string from the LLM
   */
  protected abstract callLLM(
    messages: LLMMessage[],
    config: ReviewConfig
  ): Promise<string>;

  /**
   * Check if this provider supports structured JSON output.
   * If true, the model will request JSON schema output and parse it accordingly.
   * If false, the model will request free-text output and use legacy parsing.
   */
  protected abstract supportsStructuredOutput(): boolean;

  /**
   * Get the model name/identifier for this adapter
   */
  protected abstract getModelName(): string;

  /**
   * Review code changes and generate comments.
   * This is the main entry point that orchestrates the review process.
   * @param diff File changes to review
   * @param config Review configuration
   * @returns List of AI comments
   */
  async review(diff: FileChange[], config: ReviewConfig): Promise<AIComment[]> {
    // Filter out ignored files
    const filteredDiff = this.filterIgnoredFiles(diff, config);

    // Skip if no files to review
    if (filteredDiff.length === 0) {
      return [
        {
          type: "summary",
          content: "No files to review after applying ignore patterns.",
          severity: "suggestion",
        },
      ];
    }

    const prompt = this.generatePrompt(filteredDiff, config);
    const systemPrompt = this.getSystemPrompt(config);

    try {
      const raw = await this.callLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        config
      );

      return this.supportsStructuredOutput()
        ? this.parseStructuredResponse(raw, config)
        : this.parseFreeTextResponse(raw, config);
    } catch (error) {
      console.error(`Error generating review with ${this.getModelName()}:`, error);
      throw error;
    }
  }

  /**
   * Filter out files that match ignore patterns
   */
  protected filterIgnoredFiles(
    diff: FileChange[],
    config: ReviewConfig
  ): FileChange[] {
    if (!config.ignoreFiles || config.ignoreFiles.length === 0) {
      return diff;
    }

    return diff.filter((file) => {
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

  /**
   * Generate the system prompt for the LLM
   */
  protected getSystemPrompt(_config: ReviewConfig): string {
    return "You are a senior software engineer doing a peer code review. Your job is to spot all logic, syntax, and semantic issues in a code diff. Always respond with valid JSON matching the requested schema.";
  }

  /**
   * Generate a code review prompt for the given diff
   * @param diff File changes to review
   * @param config Review configuration
   * @returns Prompt for the AI
   */
  protected generatePrompt(diff: FileChange[], config: ReviewConfig): string {
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
      "suggestion": "Suggested fix or improvement (use empty string if none)"
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
   * Parse a structured JSON response from the LLM
   * @param response Raw LLM response
   * @param config Review configuration
   * @returns List of AI comments
   */
  protected parseStructuredResponse(
    response: string,
    config: ReviewConfig
  ): AIComment[] {
    const comments: AIComment[] = [];

    // Check if the response looks like structured JSON
    if (!looksLikeStructuredResponse(response)) {
      // Fall back to legacy parsing if it doesn't look like JSON
      return this.parseFreeTextResponse(response, config);
    }

    const result = parseStructuredResponse(response);

    if (!result.success || !result.data) {
      console.warn(
        "Structured response parsing failed, falling back to legacy parsing:",
        result.error
      );
      return this.parseFreeTextResponse(response, config);
    }

    const structuredResponse = result.data;

    // Add summary comment if present
    if (structuredResponse.summary) {
      comments.push({
        type: "summary",
        content: structuredResponse.summary,
        severity: config.severity,
      });
    }

    // Convert structured comments to AIComment format
    for (const structuredComment of structuredResponse.comments) {
      // Apply severity filtering
      const severityOrder: CommentSeverity[] = [
        "critical",
        "warning",
        "suggestion",
        "nitpick",
      ];
      const minSeverity = (config.severity as CommentSeverity) || "suggestion";
      const commentSeverityIndex = severityOrder.indexOf(
        structuredComment.severity
      );
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
   * Parse a free-text response from the LLM (legacy mode)
   * Used when structured output is not supported or parsing fails.
   * @param response Raw LLM response
   * @param config Review configuration
   * @returns List of AI comments
   */
  protected parseFreeTextResponse(
    response: string,
    config: ReviewConfig
  ): AIComment[] {
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
}
