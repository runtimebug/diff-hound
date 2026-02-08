import { describe, it, expect, vi } from "vitest";
import { BaseReviewModel, LLMMessage } from "./base";
import { FileChange, ReviewConfig } from "../types";

/**
 * Concrete test implementation of BaseReviewModel.
 * Returns whatever content is set via setResponse().
 */
class TestModel extends BaseReviewModel {
  private responseContent = "";
  public lastMessages: LLMMessage[] = [];

  setResponse(content: string): void {
    this.responseContent = content;
  }

  protected getModelName(): string {
    return "TestModel";
  }

  protected supportsStructuredOutput(): boolean {
    return true;
  }

  protected async callLLM(
    messages: LLMMessage[],
    _config: ReviewConfig
  ): Promise<string> {
    this.lastMessages = messages;
    return this.responseContent;
  }
}

function makeConfig(overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  return {
    provider: "openai",
    model: "test-model",
    gitPlatform: "local",
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileChange> = {}): FileChange {
  return {
    filename: "src/app.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    patch: "+const x = 1;",
    ...overrides,
  };
}

describe("BaseReviewModel", () => {
  describe("file filtering", () => {
    it("should filter files matching glob ignore patterns", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      const result = await model.review(
        [makeFile({ filename: "README.md" })],
        makeConfig({ ignoreFiles: ["*.md"] })
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain("No files to review");
    });

    it("should filter files matching exact ignore patterns", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      const result = await model.review(
        [makeFile({ filename: "package-lock.json" })],
        makeConfig({ ignoreFiles: ["package-lock.json"] })
      );

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain("No files to review");
    });

    it("should keep files that do not match ignore patterns", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review(
        [makeFile({ filename: "src/index.ts" })],
        makeConfig({ ignoreFiles: ["*.md"] })
      );

      // callLLM was invoked (file was not filtered out)
      expect(model.lastMessages).toHaveLength(2);
    });

    it("should pass all files through when no ignore patterns are set", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review(
        [makeFile(), makeFile({ filename: "src/other.ts" })],
        makeConfig()
      );

      expect(model.lastMessages).toHaveLength(2);
    });
  });

  describe("prompt generation", () => {
    it("should include file names and diff content in prompt", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review(
        [makeFile({ filename: "src/foo.ts", patch: "+const y = 2;" })],
        makeConfig()
      );

      const userMessage = model.lastMessages[1].content;
      expect(userMessage).toContain("src/foo.ts");
      expect(userMessage).toContain("+const y = 2;");
    });

    it("should include custom rules in prompt", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review(
        [makeFile()],
        makeConfig({ rules: ["Use const over let", "No magic numbers"] })
      );

      const userMessage = model.lastMessages[1].content;
      expect(userMessage).toContain("- Use const over let");
      expect(userMessage).toContain("- No magic numbers");
    });

    it("should include custom prompt in user message", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review(
        [makeFile()],
        makeConfig({ customPrompt: "Focus on security issues" })
      );

      const userMessage = model.lastMessages[1].content;
      expect(userMessage).toContain("Focus on security issues");
    });

    it("should set system message as first message", async () => {
      const model = new TestModel();
      model.setResponse(JSON.stringify({ summary: "", comments: [] }));

      await model.review([makeFile()], makeConfig());

      expect(model.lastMessages[0].role).toBe("system");
      expect(model.lastMessages[0].content).toContain("senior software engineer");
    });
  });

  describe("structured response parsing", () => {
    it("should parse valid structured JSON response", async () => {
      const model = new TestModel();
      model.setResponse(
        JSON.stringify({
          summary: "Good code",
          comments: [
            {
              file: "src/app.ts",
              line: 5,
              severity: "warning",
              category: "bug",
              confidence: 0.9,
              title: "Null check missing",
              explanation: "Variable could be null",
              suggestion: "Add null check",
            },
          ],
        })
      );

      const result = await model.review([makeFile()], makeConfig());

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("summary");
      expect(result[0].content).toBe("Good code");
      expect(result[1].type).toBe("inline");
      expect(result[1].path).toBe("src/app.ts");
      expect(result[1].line).toBe(5);
    });

    it("should filter comments below minimum confidence", async () => {
      const model = new TestModel();
      model.setResponse(
        JSON.stringify({
          summary: "",
          comments: [
            {
              file: "src/app.ts",
              line: 1,
              severity: "suggestion",
              category: "style",
              confidence: 0.3,
              title: "Low confidence",
              explanation: "Should be filtered",
              suggestion: "",
            },
            {
              file: "src/app.ts",
              line: 2,
              severity: "warning",
              category: "bug",
              confidence: 0.9,
              title: "High confidence",
              explanation: "Should pass",
              suggestion: "",
            },
          ],
        })
      );

      const result = await model.review([makeFile()], makeConfig());
      const inlineComments = result.filter((c) => c.type === "inline");
      expect(inlineComments).toHaveLength(1);
      expect(inlineComments[0].line).toBe(2);
    });

    it("should filter comments below minimum severity", async () => {
      const model = new TestModel();
      model.setResponse(
        JSON.stringify({
          summary: "",
          comments: [
            {
              file: "src/app.ts",
              line: 1,
              severity: "nitpick",
              category: "style",
              confidence: 0.9,
              title: "Nitpick",
              explanation: "Should be filtered when min is suggestion",
              suggestion: "",
            },
            {
              file: "src/app.ts",
              line: 2,
              severity: "warning",
              category: "bug",
              confidence: 0.9,
              title: "Warning",
              explanation: "Should pass",
              suggestion: "",
            },
          ],
        })
      );

      const result = await model.review(
        [makeFile()],
        makeConfig({ severity: "suggestion" })
      );
      const inlineComments = result.filter((c) => c.type === "inline");
      expect(inlineComments).toHaveLength(1);
      expect(inlineComments[0].line).toBe(2);
    });
  });

  describe("legacy response parsing", () => {
    it("should parse inline comments from free-text response", async () => {
      const model = new TestModel();
      model.setResponse("src/app.ts:5 — Missing null check");

      const result = await model.review([makeFile()], makeConfig());

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("inline");
      expect(result[0].path).toBe("src/app.ts");
      expect(result[0].line).toBe(5);
      expect(result[0].content).toBe("Missing null check");
    });

    it("should fall back to summary when no inline comments found", async () => {
      const model = new TestModel();
      model.setResponse("This code looks fine overall.");

      const result = await model.review([makeFile()], makeConfig());

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
      expect(result[0].content).toBe("This code looks fine overall.");
    });

    it("should return summary when commentStyle is summary", async () => {
      const model = new TestModel();
      model.setResponse("src/app.ts:5 — This would normally be inline");

      const result = await model.review(
        [makeFile()],
        makeConfig({ commentStyle: "summary" })
      );

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
    });
  });

  describe("malformed structured response", () => {
    it("should fall back to legacy parsing for invalid JSON schema", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const model = new TestModel();
      // Valid JSON but wrong schema (missing required fields)
      model.setResponse(JSON.stringify({ comments: [{ wrong: "fields" }] }));

      const result = await model.review([makeFile()], makeConfig());

      // Falls through to legacy parsing → summary comment
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("summary");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
