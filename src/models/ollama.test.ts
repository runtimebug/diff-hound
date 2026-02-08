import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("OllamaModel constructor validation", () => {
  it("should throw error if model is not provided", async () => {
    const { OllamaModel } = await import("./ollama.js");
    expect(() => new OllamaModel("")).toThrow("Model is required");
  });

  it("should not require any environment variables", async () => {
    const { OllamaModel } = await import("./ollama.js");
    expect(() => new OllamaModel("llama3")).not.toThrow();
  });

  it("should accept a custom endpoint", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3", "http://custom:11434");
    expect(model).toBeDefined();
  });
});

describe("OllamaModel.review()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should return skip comment when all files are ignored", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    const result = await model.review(
      [{ filename: "test.md", status: "modified", additions: 1, deletions: 0, patch: "+hello" }],
      {
        provider: "ollama",
        model: "llama3",
        gitPlatform: "local",
        ignoreFiles: ["*.md"],
      }
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("summary");
    expect(result[0].content).toContain("No files to review");
  });

  it("should call Ollama /api/chat with correct request shape", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    const mockResponse = {
      model: "llama3",
      created_at: "2024-01-01T00:00:00Z",
      message: {
        role: "assistant",
        content: JSON.stringify({
          summary: "Looks good",
          comments: [],
        }),
      },
      done: true,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await model.review(
      [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+const x = 1;" }],
      {
        provider: "ollama",
        model: "llama3",
        gitPlatform: "local",
      }
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("llama3");
    expect(body.format).toBe("json");
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.options.temperature).toBe(0.1);
  });

  it("should use custom endpoint when provided", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3", "http://remote:9999");

    const mockResponse = {
      model: "llama3",
      created_at: "2024-01-01T00:00:00Z",
      message: {
        role: "assistant",
        content: JSON.stringify({ summary: "", comments: [] }),
      },
      done: true,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await model.review(
      [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
      { provider: "ollama", model: "llama3", gitPlatform: "local" }
    );

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://remote:9999/api/chat");
  });

  it("should parse structured JSON response from Ollama", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    const structuredResponse = {
      summary: "Found an issue",
      comments: [
        {
          file: "src/app.ts",
          line: 5,
          severity: "warning",
          category: "bug",
          confidence: 0.85,
          title: "Potential null reference",
          explanation: "Variable could be null here",
          suggestion: "Add null check",
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: {
            role: "assistant",
            content: JSON.stringify(structuredResponse),
          },
          done: true,
        }),
    });

    const result = await model.review(
      [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+const x = null;" }],
      { provider: "ollama", model: "llama3", gitPlatform: "local" }
    );

    // Summary + 1 inline comment
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("summary");
    expect(result[0].content).toBe("Found an issue");
    expect(result[1].type).toBe("inline");
    expect(result[1].path).toBe("src/app.ts");
    expect(result[1].line).toBe(5);
  });

  it("should fall back to legacy parsing for non-JSON responses", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: {
            role: "assistant",
            content: "src/app.ts:5 — Missing null check",
          },
          done: true,
        }),
    });

    const result = await model.review(
      [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
      { provider: "ollama", model: "llama3", gitPlatform: "local" }
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("inline");
    expect(result[0].path).toBe("src/app.ts");
    expect(result[0].line).toBe(5);
    expect(result[0].content).toBe("Missing null check");
  });

  it("should throw on HTTP error from Ollama API", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("model 'llama3' not found"),
    });

    await expect(
      model.review(
        [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
        { provider: "ollama", model: "llama3", gitPlatform: "local" }
      )
    ).rejects.toThrow("Ollama API error (404)");
  });

  it("should throw actionable error when Ollama is not running", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError("fetch failed")
    );

    await expect(
      model.review(
        [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
        { provider: "ollama", model: "llama3", gitPlatform: "local" }
      )
    ).rejects.toThrow("Cannot connect to Ollama");
  });

  it("should throw on empty response content", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "" },
          done: true,
        }),
    });

    await expect(
      model.review(
        [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
        { provider: "ollama", model: "llama3", gitPlatform: "local" }
      )
    ).rejects.toThrow("No response content from Ollama");
  });

  it("should filter comments below minimum confidence", async () => {
    const { OllamaModel } = await import("./ollama.js");
    const model = new OllamaModel("llama3");

    const structuredResponse = {
      summary: "",
      comments: [
        {
          file: "src/app.ts",
          line: 1,
          severity: "suggestion",
          category: "style",
          confidence: 0.3,
          title: "Low confidence comment",
          explanation: "This should be filtered out",
          suggestion: "",
        },
        {
          file: "src/app.ts",
          line: 2,
          severity: "warning",
          category: "bug",
          confidence: 0.9,
          title: "High confidence comment",
          explanation: "This should pass through",
          suggestion: "",
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: {
            role: "assistant",
            content: JSON.stringify(structuredResponse),
          },
          done: true,
        }),
    });

    const result = await model.review(
      [{ filename: "src/app.ts", status: "modified", additions: 1, deletions: 0, patch: "+x" }],
      { provider: "ollama", model: "llama3", gitPlatform: "local" }
    );

    // Only the high-confidence comment should pass (low confidence filtered)
    const inlineComments = result.filter((c: { type: string }) => c.type === "inline");
    expect(inlineComments).toHaveLength(1);
    expect(inlineComments[0].line).toBe(2);
  });
});
