import { describe, it, expect } from "vitest";
import {
  validateStructuredResponse,
  parseStructuredResponse,
  looksLikeStructuredResponse,
} from "./validate";
import { toAIComment, StructuredComment } from "./review-response";

describe("Schema Validation", () => {
  describe("validateStructuredResponse", () => {
    it("should validate a valid structured response", () => {
      const response = {
        summary: "Overall review",
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning" as const,
            category: "style" as const,
            confidence: 0.85,
            title: "Use const instead of let",
            explanation: "The variable is never reassigned",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate response with empty summary", () => {
      const response = {
        summary: "",
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning" as const,
            category: "style" as const,
            confidence: 0.85,
            title: "Use const instead of let",
            explanation: "The variable is never reassigned",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(true);
    });

    it("should fail for non-object response", () => {
      const result = validateStructuredResponse("not an object");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be an object");
    });

    it("should fail for missing comments array", () => {
      const response = { summary: "No comments" };
      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("'comments' must be an array");
    });

    it("should fail for invalid severity", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "invalid",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("severity");
    });

    it("should fail for invalid category", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "invalid",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("category");
    });

    it("should fail for confidence out of range", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 1.5,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("confidence");
    });

    it("should fail for negative confidence", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: -0.1,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("confidence");
    });

    it("should fail for line number less than 1", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 0,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("line");
    });

    it("should fail for non-integer line number", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10.5,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("line");
    });

    it("should fail for empty file path", () => {
      const response = {
        comments: [
          {
            file: "",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("file");
    });

    it("should fail for empty title", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "",
            explanation: "Test",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("title");
    });

    it("should fail for empty explanation", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "",
            suggestion: "",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("explanation");
    });

    it("should validate all valid severity values", () => {
      const severities = ["critical", "warning", "suggestion", "nitpick"];
      
      for (const severity of severities) {
        const response = {
          summary: "",
          comments: [
            {
              file: "src/utils.ts",
              line: 10,
              severity,
              category: "style",
              confidence: 0.85,
              title: "Test",
              explanation: "Test",
            suggestion: "",
            },
          ],
        };

        const result = validateStructuredResponse(response);
        expect(result.valid).toBe(true);
      }
    });

    it("should validate all valid category values", () => {
      const categories = ["bug", "security", "performance", "style", "architecture", "testing"];
      
      for (const category of categories) {
        const response = {
          summary: "",
          comments: [
            {
              file: "src/utils.ts",
              line: 10,
              severity: "warning",
              category,
              confidence: 0.85,
              title: "Test",
              explanation: "Test",
            suggestion: "",
            },
          ],
        };

        const result = validateStructuredResponse(response);
        expect(result.valid).toBe(true);
      }
    });

    it("should validate response with suggestion", () => {
      const response = {
        summary: "",
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Use const",
            explanation: "Variable is not reassigned",
            suggestion: "const x = 5;",
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(true);
    });

    it("should fail for non-string suggestion", () => {
      const response = {
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: 123,
          },
        ],
      };

      const result = validateStructuredResponse(response);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("suggestion");
    });
  });

  describe("parseStructuredResponse", () => {
    it("should parse valid JSON string", () => {
      const json = JSON.stringify({
        summary: "Test summary",
        comments: [
          {
            file: "src/utils.ts",
            line: 10,
            severity: "warning",
            category: "style",
            confidence: 0.85,
            title: "Test",
            explanation: "Test",
            suggestion: "",
          },
        ],
      });

      const result = parseStructuredResponse(json);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.comments).toHaveLength(1);
    });

    it("should return error for invalid JSON", () => {
      const result = parseStructuredResponse("not json");
      expect(result.success).toBe(false);
      expect(result.error).toContain("JSON parse error");
    });

    it("should return error for invalid structure", () => {
      const json = JSON.stringify({ comments: "not an array" });
      const result = parseStructuredResponse(json);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });
  });

  describe("looksLikeStructuredResponse", () => {
    it("should return true for JSON with comments array", () => {
      const response = '{"comments": []}';
      expect(looksLikeStructuredResponse(response)).toBe(true);
    });

    it("should return true for JSON with comments and summary", () => {
      const response = '{"summary": "test", "comments": [{"file": "test.ts"}]}';
      expect(looksLikeStructuredResponse(response)).toBe(true);
    });

    it("should return false for non-JSON string", () => {
      expect(looksLikeStructuredResponse("not json")).toBe(false);
    });

    it("should return false for JSON without comments array", () => {
      expect(looksLikeStructuredResponse('{"summary": "test"}')).toBe(false);
    });

    it("should return false for JSON array", () => {
      expect(looksLikeStructuredResponse('["item1", "item2"]')).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(looksLikeStructuredResponse("")).toBe(false);
    });
  });

  describe("toAIComment", () => {
    it("should convert critical severity to error", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "critical",
        category: "security",
        confidence: 0.95,
        title: "SQL injection risk",
        explanation: "User input is not sanitized",
        suggestion: "Use parameterized queries",
      };

      const result = toAIComment(comment);
      expect(result.severity).toBe("error");
      expect(result.type).toBe("inline");
      expect(result.path).toBe("src/test.ts");
      expect(result.line).toBe(10);
    });

    it("should convert warning severity to warning", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "warning",
        category: "performance",
        confidence: 0.8,
        title: "N+1 query",
        explanation: "Consider eager loading",
        suggestion: "",
      };

      const result = toAIComment(comment);
      expect(result.severity).toBe("warning");
    });

    it("should convert suggestion and nitpick to suggestion", () => {
      const suggestionComment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "suggestion",
        category: "style",
        confidence: 0.7,
        title: "Use const",
        explanation: "Variable is not reassigned",
        suggestion: "const x = 5;",
      };

      const nitpickComment: StructuredComment = {
        file: "src/test.ts",
        line: 11,
        severity: "nitpick",
        category: "style",
        confidence: 0.6,
        title: "Spacing issue",
        explanation: "Missing space after comma",
        suggestion: "",
      };

      expect(toAIComment(suggestionComment).severity).toBe("suggestion");
      expect(toAIComment(nitpickComment).severity).toBe("suggestion");
    });

    it("should include category in title", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "warning",
        category: "security",
        suggestion: "",
        confidence: 0.9,
        title: "Hardcoded secret",
        explanation: "API key should be in environment variable",
      };

      const result = toAIComment(comment);
      expect(result.content).toContain("**[Security]");
      expect(result.content).toContain("Hardcoded secret");
    });

    it("should include confidence percentage", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "warning",
        category: "bug",
        confidence: 0.87,
        title: "Null check missing",
        explanation: "Object could be null",
        suggestion: "Add null check",
      };

      const result = toAIComment(comment);
      expect(result.content).toContain("(confidence: 87%)");
    });

    it("should include suggestion when provided", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "warning",
        category: "style",
        confidence: 0.85,
        title: "Use const",
        explanation: "Variable is not reassigned",
        suggestion: "const x = 5;",
      };

      const result = toAIComment(comment);
      expect(result.content).toContain("**Suggestion:**");
      expect(result.content).toContain("```");
      expect(result.content).toContain("const x = 5;");
    });

    it("should not include suggestion section when not provided", () => {
      const comment: StructuredComment = {
        file: "src/test.ts",
        line: 10,
        severity: "warning",
        category: "style",
        confidence: 0.85,
        title: "Use const",
        explanation: "Variable is not reassigned",
        suggestion: "",
      };

      const result = toAIComment(comment);
      expect(result.content).not.toContain("**Suggestion:**");
    });
  });
});
