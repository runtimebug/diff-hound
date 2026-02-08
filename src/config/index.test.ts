import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { loadConfig, validateConfig, DEFAULT_CONFIG } from "./index";
import { ReviewConfig } from "../types";

// Mock fs module
vi.mock("fs");

describe("loadConfig", () => {
  const mockCwd = "/test/project";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue(mockCwd);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("with no config files", () => {
    it("should return default config when no config files exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = await loadConfig();

      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("with explicit config path", () => {
    it("should load config from specified JSON path", async () => {
      const customConfig = {
        provider: "openai" as const,
        model: "gpt-4-turbo",
        repo: "custom/repo",
      };

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === "/custom/path.json"
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(customConfig));

      const config = await loadConfig("/custom/path.json");

      expect(config.model).toBe("gpt-4-turbo");
      expect(config.repo).toBe("custom/repo");
      expect(config.provider).toBe("openai");
    });

    it("should load config from specified YAML path", async () => {
      const yamlContent = `
provider: openai
model: gpt-3.5-turbo
verbose: true
`;

      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === "/custom/path.yml"
      );
      vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);

      const config = await loadConfig("/custom/path.yml");

      expect(config.model).toBe("gpt-3.5-turbo");
      expect(config.verbose).toBe(true);
    });

    it("should return default config if explicit path does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = await loadConfig("/nonexistent/config.json");

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("should handle file read errors gracefully", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const config = await loadConfig("/error/config.json");

      expect(config).toEqual(DEFAULT_CONFIG);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("with default config file discovery", () => {
    it("should prefer .aicodeconfig.json over .aicode.yml", async () => {
      const jsonConfig = { model: "gpt-4o" };
      const yamlConfig = { model: "gpt-3.5-turbo" };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = p as string;
        return (
          pathStr.endsWith(".aicodeconfig.json") ||
          pathStr.endsWith(".aicode.yml")
        );
      });

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if ((p as string).endsWith(".json")) {
          return JSON.stringify(jsonConfig);
        }
        return "model: gpt-3.5-turbo";
      });

      const config = await loadConfig();

      // Should use JSON config, not YAML
      expect(config.model).toBe("gpt-4o");
    });

    it("should fall back to .aicode.yml if .aicodeconfig.json does not exist", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return (p as string).endsWith(".aicode.yml");
      });

      vi.mocked(fs.readFileSync).mockReturnValue("model: gpt-4o-mini");

      const config = await loadConfig();

      expect(config.model).toBe("gpt-4o-mini");
    });
  });

  describe("config merging", () => {
    it("should merge loaded config with defaults", async () => {
      const partialConfig = {
        model: "custom-model",
        repo: "owner/repo",
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(partialConfig));

      const config = await loadConfig("/test/config.json");

      // Should have loaded values
      expect(config.model).toBe("custom-model");
      expect(config.repo).toBe("owner/repo");

      // Should have default values for unspecified fields
      expect(config.provider).toBe(DEFAULT_CONFIG.provider);
      expect(config.commentStyle).toBe(DEFAULT_CONFIG.commentStyle);
      expect(config.severity).toBe(DEFAULT_CONFIG.severity);
    });

    it("should handle all config fields", async () => {
      const fullConfig: ReviewConfig = {
        provider: "openai",
        model: "gpt-4o",
        gitPlatform: "github",
        repo: "test/repo",
        commentStyle: "summary",
        dryRun: true,
        verbose: true,
        endpoint: "https://custom.api.com",
        configPath: "/custom/path",
        severity: "error",
        ignoreFiles: ["*.test.ts"],
        rules: ["Check types"],
        customPrompt: "Custom prompt",
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fullConfig));

      const config = await loadConfig("/test/config.json");

      expect(config).toMatchObject(fullConfig);
    });
  });

  describe("file format support", () => {
    it("should throw error for unsupported file format", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("content");

      const config = await loadConfig("/test/config.txt");

      expect(config).toEqual(DEFAULT_CONFIG);
      expect(console.error).toHaveBeenCalled();
    });

    it("should support .yaml extension", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        (p as string).endsWith(".yaml")
      );
      vi.mocked(fs.readFileSync).mockReturnValue("model: gpt-4");

      const config = await loadConfig("/test/config.yaml");

      expect(config.model).toBe("gpt-4");
    });

    it("should handle invalid JSON gracefully", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json");

      const config = await loadConfig("/test/config.json");

      expect(config).toEqual(DEFAULT_CONFIG);
      expect(console.error).toHaveBeenCalled();
    });

    it("should handle invalid YAML gracefully", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid yaml: [ }");

      const config = await loadConfig("/test/config.yml");

      expect(config).toEqual(DEFAULT_CONFIG);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe("validateConfig", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("provider validation", () => {
    it("should accept valid provider 'openai'", () => {
      const cliOptions = { provider: "openai" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.provider).toBe("openai");
    });

    it("should reject invalid provider and fall back to default", () => {
      const cliOptions = { provider: "invalid-provider" as any };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.provider).toBe(DEFAULT_CONFIG.provider);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("platform validation", () => {
    it("should accept valid platform 'github'", () => {
      const cliOptions = { gitPlatform: "github" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.gitPlatform).toBe("github");
    });

    it("should accept valid platform 'local'", () => {
      const cliOptions = { gitPlatform: "local" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.gitPlatform).toBe("local");
    });

    it("should reject invalid platform and fall back to default", () => {
      const cliOptions = { gitPlatform: "bitbucket" as any };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.gitPlatform).toBe(DEFAULT_CONFIG.gitPlatform);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("severity validation", () => {
    it("should accept valid severity 'suggestion'", () => {
      const cliOptions = { severity: "suggestion" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.severity).toBe("suggestion");
    });

    it("should accept valid severity 'warning'", () => {
      const cliOptions = { severity: "warning" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.severity).toBe("warning");
    });

    it("should accept valid severity 'error'", () => {
      const cliOptions = { severity: "error" as const };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.severity).toBe("error");
    });

    it("should reject invalid severity and fall back to default", () => {
      const cliOptions = { severity: "critical" as any };
      const config = { ...DEFAULT_CONFIG };

      const result = validateConfig(cliOptions, config);

      expect(result.severity).toBe(DEFAULT_CONFIG.severity);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("CLI options merging", () => {
    it("should CLI options override file config", () => {
      const cliOptions: Partial<ReviewConfig> = {
        model: "cli-model",
        verbose: true,
      };
      const fileConfig: ReviewConfig = {
        ...DEFAULT_CONFIG,
        model: "file-model",
        verbose: false,
      };

      const result = validateConfig(cliOptions, fileConfig);

      expect(result.model).toBe("cli-model");
      expect(result.verbose).toBe(true);
    });

    it("should preserve file config values not in CLI options", () => {
      const cliOptions: Partial<ReviewConfig> = {
        model: "new-model",
      };
      const fileConfig: ReviewConfig = {
        ...DEFAULT_CONFIG,
        repo: "owner/repo",
        severity: "error",
      };

      const result = validateConfig(cliOptions, fileConfig);

      expect(result.model).toBe("new-model");
      expect(result.repo).toBe("owner/repo");
      expect(result.severity).toBe("error");
    });

    it("should handle all CLI option overrides", () => {
      const cliOptions: Partial<ReviewConfig> = {
        provider: "openai",
        model: "gpt-4o",
        gitPlatform: "github",
        repo: "cli/repo",
        commentStyle: "summary",
        dryRun: true,
        verbose: true,
        endpoint: "https://cli.api.com",
        severity: "error",
        ignoreFiles: ["*.spec.ts"],
        rules: ["CLI rule"],
        customPrompt: "CLI prompt",
      };

      const result = validateConfig(cliOptions, DEFAULT_CONFIG);

      expect(result).toMatchObject(cliOptions);
    });
  });

  describe("default config values", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_CONFIG.provider).toBe("openai");
      expect(DEFAULT_CONFIG.model).toBe("gpt-4o");
      expect(DEFAULT_CONFIG.gitPlatform).toBe("github");
      expect(DEFAULT_CONFIG.commentStyle).toBe("inline");
      expect(DEFAULT_CONFIG.dryRun).toBe(false);
      expect(DEFAULT_CONFIG.verbose).toBe(false);
      expect(DEFAULT_CONFIG.severity).toBe("suggestion");
      expect(DEFAULT_CONFIG.ignoreFiles).toEqual([]);
    });
  });
});
