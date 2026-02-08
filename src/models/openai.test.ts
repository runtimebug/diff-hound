import { describe, it, expect } from "vitest";

// Test the response parsing function directly
// We need to extract the parseResponse function for testing

// Re-implement the parsing logic for testing (same as in openai.ts)
function parseResponse(response: string, commentStyle: "inline" | "summary", severity: string): Array<{
  type: "inline" | "summary";
  path?: string;
  line?: number;
  content: string;
  severity?: string;
}> {
  const comments: Array<{
    type: "inline" | "summary";
    path?: string;
    line?: number;
    content: string;
    severity?: string;
  }> = [];

  if (commentStyle === "summary") {
    comments.push({
      type: "summary",
      content: response.trim(),
      severity,
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
      severity,
    });
  }

  // If no inline comments were parsed, create a summary comment
  if (comments.length === 0) {
    comments.push({
      type: "summary",
      content: response.trim(),
      severity,
    });
  }

  return comments;
}

describe("OpenAI Response Parsing", () => {
  const severity = "suggestion";

  describe("summary style", () => {
    it("should return summary comment when commentStyle is summary", () => {
      const summaryContent = "This is a summary of the changes.";

      const result = parseResponse(summaryContent, "summary", severity);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "summary",
        content: summaryContent,
        severity: "suggestion",
      });
    });
  });

  describe("inline style", () => {
    it("should parse inline comments correctly", () => {
      const response = `src/utils.ts:3 — Missing null check on the user object
src/utils.ts:8 — Unused import 'fs'
src/utils.ts:15 — Consider using const instead of let`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        type: "inline",
        path: "src/utils.ts",
        line: 3,
        content: "Missing null check on the user object",
        severity: "suggestion",
      });
      expect(result[1]).toEqual({
        type: "inline",
        path: "src/utils.ts",
        line: 8,
        content: "Unused import 'fs'",
        severity: "suggestion",
      });
      expect(result[2]).toEqual({
        type: "inline",
        path: "src/utils.ts",
        line: 15,
        content: "Consider using const instead of let",
        severity: "suggestion",
      });
    });

    it("should handle em-dash separator in inline comments", () => {
      const response = `src/file.ts:10 — Comment with em-dash`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(10);
      expect(result[0].content).toBe("Comment with em-dash");
    });

    it("should handle en-dash separator in inline comments", () => {
      const response = `src/file.ts:5 – Comment with en-dash`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(5);
    });

    it("should handle hyphen separator in inline comments", () => {
      const response = `src/file.ts:5 - Comment with hyphen`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(5);
    });

    it("should fall back to summary if no inline comments are parsed", () => {
      const response = "This is just a general review comment without specific line numbers.";

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
      expect(result[0].content).toBe(response);
    });

    it("should handle comments with colons in content", () => {
      const response = `src/file.ts:10 — Warning: this is a warning with: multiple colons`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(10);
      expect(result[0].content).toContain("Warning:");
      expect(result[0].content).toContain("multiple colons");
    });

    it("should handle file paths with dots and dashes", () => {
      const response = `src/my-component.test.ts:42 — Test comment`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/my-component.test.ts");
      expect(result[0].line).toBe(42);
    });

    it("should handle file paths with nested directories", () => {
      const response = `src/components/user/profile/settings.ts:100 — Deeply nested file`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/components/user/profile/settings.ts");
      expect(result[0].line).toBe(100);
    });

    it("should handle comments at line 1", () => {
      const response = `src/file.ts:1 — Comment on first line`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(1);
    });

    it("should handle comments at high line numbers", () => {
      const response = `src/file.ts:9999 — Comment on high line number`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].line).toBe(9999);
    });

    it("should handle empty content", () => {
      const response = "";

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
      expect(result[0].content).toBe("");
    });

    it("should handle whitespace-only content", () => {
      const response = "   \n\n   ";

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
    });

    it("should handle multiple files in same response", () => {
      const response = `src/utils.ts:5 — First file comment
src/helpers.ts:10 — Second file comment
src/constants.ts:1 — Third file comment`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(3);
      expect(result[0].path).toBe("src/utils.ts");
      expect(result[1].path).toBe("src/helpers.ts");
      expect(result[2].path).toBe("src/constants.ts");
    });

    it("should trim whitespace from comment content", () => {
      const response = `src/file.ts:10 —    Comment with extra spaces   `;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Comment with extra spaces");
    });

    it("should handle comments with quotes and special characters", () => {
      const response = `src/file.ts:10 — This has "quotes" and 'apostrophes' and \`backticks\``;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('"quotes"');
      expect(result[0].content).toContain("'apostrophes'");
      expect(result[0].content).toContain("`backticks`");
    });

    it("should handle comments with parentheses and brackets", () => {
      const response = `src/file.ts:10 — Check the array[index] and call function(arg1, arg2)`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain("array[index]");
      expect(result[0].content).toContain("function(arg1, arg2)");
    });

    it("should handle comments with URL-like paths", () => {
      const response = `src/file.ts:10 — See https://example.com/docs for more info`;

      const result = parseResponse(response, "inline", severity);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain("https://example.com/docs");
    });
  });
});

describe("OpenAIModel constructor validation", () => {
  // We need to dynamically import the OpenAIModel to avoid module-level side effects
  it("should throw error if OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;

    const { OpenAIModel } = await import("./openai.js");

    expect(() => new OpenAIModel("gpt-4o")).toThrow(
      "OPENAI_API_KEY environment variable is required"
    );
  });

  it("should throw error if model is not provided", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const { OpenAIModel } = await import("./openai.js");

    expect(() => new OpenAIModel("")).toThrow("Model is required");

    delete process.env.OPENAI_API_KEY;
  });
});
