import type { StructuredReviewResponse } from "./review-response";

/**
 * Simple validation for structured review response
 * Note: OpenAI's JSON Schema response_format already validates the structure,
 * but we add runtime validation for safety and to handle any edge cases.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a structured review response
 */
export function validateStructuredResponse(
  data: unknown
): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Response must be an object"] };
  }

  const response = data as Record<string, unknown>;

  // Check comments array exists
  if (!Array.isArray(response.comments)) {
    errors.push("'comments' must be an array");
    return { valid: false, errors };
  }

  // Validate each comment
  const validSeverities = ["critical", "warning", "suggestion", "nitpick"];
  const validCategories = ["bug", "security", "performance", "style", "architecture", "testing"];

  for (let i = 0; i < response.comments.length; i++) {
    const comment = response.comments[i];
    const prefix = `comments[${i}]`;

    if (typeof comment !== "object" || comment === null) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const c = comment as Record<string, unknown>;

    // Required fields
    if (typeof c.file !== "string" || c.file.length === 0) {
      errors.push(`${prefix}.file is required and must be a non-empty string`);
    }

    if (typeof c.line !== "number" || !Number.isInteger(c.line) || c.line < 1) {
      errors.push(`${prefix}.line must be a positive integer`);
    }

    if (!validSeverities.includes(c.severity as string)) {
      errors.push(`${prefix}.severity must be one of: ${validSeverities.join(", ")}`);
    }

    if (!validCategories.includes(c.category as string)) {
      errors.push(`${prefix}.category must be one of: ${validCategories.join(", ")}`);
    }

    if (typeof c.confidence !== "number" || c.confidence < 0 || c.confidence > 1) {
      errors.push(`${prefix}.confidence must be a number between 0 and 1`);
    }

    if (typeof c.title !== "string" || c.title.length === 0) {
      errors.push(`${prefix}.title is required and must be a non-empty string`);
    }

    if (typeof c.explanation !== "string" || c.explanation.length === 0) {
      errors.push(`${prefix}.explanation is required and must be a non-empty string`);
    }

    // Optional fields
    if (c.suggestion !== undefined && typeof c.suggestion !== "string") {
      errors.push(`${prefix}.suggestion must be a string if provided`);
    }
  }

  // Check summary if provided
  if (response.summary !== undefined && typeof response.summary !== "string") {
    errors.push("'summary' must be a string if provided");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse and validate a JSON string into a structured response
 */
export function parseStructuredResponse(json: string): {
  success: boolean;
  data?: StructuredReviewResponse;
  error?: string;
} {
  try {
    const parsed = JSON.parse(json) as unknown;
    const validation = validateStructuredResponse(parsed);

    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join("; ")}`,
      };
    }

    return {
      success: true,
      data: parsed as StructuredReviewResponse,
    };
  } catch (e) {
    return {
      success: false,
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Check if a response looks like it might be structured JSON
 * (starts with { and contains expected fields)
 */
export function looksLikeStructuredResponse(response: string): boolean {
  const trimmed = response.trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }
  
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return Array.isArray(parsed.comments);
  } catch {
    return false;
  }
}
