/**
 * Types for structured LLM review responses
 * Replaces free-text parsing with JSON Schema validation
 */

export type CommentSeverity = "critical" | "warning" | "suggestion" | "nitpick";
export type CommentCategory =
  | "bug"
  | "security"
  | "performance"
  | "style"
  | "architecture"
  | "testing";

/**
 * A single structured comment from the AI review
 */
export interface StructuredComment {
  file: string;
  line: number;
  severity: CommentSeverity;
  category: CommentCategory;
  confidence: number; // 0.0–1.0
  title: string; // One-line summary (max 80 chars)
  explanation: string; // Detailed explanation
  suggestion?: string; // Suggested code fix
}

/**
 * Structured review response from LLM
 */
export interface StructuredReviewResponse {
  summary?: string;
  comments: StructuredComment[];
}

/**
 * Convert a StructuredComment to the legacy AIComment format
 * for backward compatibility with platform adapters
 */
export function toAIComment(
  comment: StructuredComment
): {
  type: "inline";
  path: string;
  line: number;
  content: string;
  severity: "error" | "warning" | "suggestion";
} {
  // Map severity to legacy format
  const severityMap: Record<CommentSeverity, "error" | "warning" | "suggestion"> = {
    critical: "error",
    warning: "warning",
    suggestion: "suggestion",
    nitpick: "suggestion",
  };

  // Build content with rich formatting
  let content = `**[${capitalize(comment.category)}] ${comment.title}**`;
  
  // Add confidence badge
  const confidencePercent = Math.round(comment.confidence * 100);
  content += ` (confidence: ${confidencePercent}%)`;
  
  content += `\n\n${comment.explanation}`;
  
  if (comment.suggestion) {
    content += `\n\n**Suggestion:**\n\`\`\`\n${comment.suggestion}\n\`\`\``;
  }

  return {
    type: "inline",
    path: comment.file,
    line: comment.line,
    content,
    severity: severityMap[comment.severity],
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
