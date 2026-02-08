import { Command } from "commander";
import dotenv from "dotenv";
import { version } from "../../package.json";
import { ReviewConfig, Platform } from "../types";
import { DEFAULT_CONFIG } from "../config";

// Load environment variables
dotenv.config();

/**
 * Parse and validate CLI arguments
 */
export function parseCli(): Partial<ReviewConfig> {
  const program = new Command();

  program
    .name("diff-hound")
    .description("AI-powered code review for GitHub, GitLab, and Bitbucket")
    .version(version)
    .option(
      "-p, --provider <provider>",
      "The provider of the AI model (openai, ollama, anthropic, deepseek, groq, gemini)",
      DEFAULT_CONFIG.provider
    )
    .option(
      "-m, --model <model>",
      "The AI model (gpt-4o, claude-3-5-sonnet, deepseek, llama3, gemini-2.0-flash)",
      DEFAULT_CONFIG.model
    )
    .option("-e, --model-endpoint <endpoint>", "The endpoint for the AI model")
    .option(
      "-g, --git-platform <platform>",
      "Platform to use (github, gitlab, bitbucket)",
      DEFAULT_CONFIG.gitPlatform
    )
    .option("-r, --repo <owner/repo>", "Repository to review")
    .option(
      "-s, --comment-style <commentStyle>",
      "Comment style (inline, summary)",
      DEFAULT_CONFIG.commentStyle
    )
    .option(
      "-d, --dry-run",
      "Do not post comments, just print them",
      DEFAULT_CONFIG.dryRun
    )
    .option("-v, --verbose", "Enable verbose logging", DEFAULT_CONFIG.verbose)
    .option(
      "-c, --config-path <path>",
      "Path to config file (default: .aicodeconfig.json or .aicode.yml)"
    )
    .option(
      "-l, --local",
      "Review local git diff instead of remote PRs (always dry-run)"
    )
    .option(
      "--base <ref>",
      "Base branch/commit for local diff (default: HEAD~1 or upstream)"
    )
    .option(
      "--head <ref>",
      "Head branch/commit for local diff (default: HEAD)"
    )
    .option(
      "--patch <path>",
      "Review a patch file directly (implies --local)"
    )
    .option(
      "--request-timeout <ms>",
      "Request timeout in milliseconds (default: 120000)",
    )
    .parse(process.argv);

  const options = program.opts();

  const isLocal = options.local || options.patch;

  return sanitizeCliOptions({
    provider: options.provider,
    model: options.model,
    gitPlatform: isLocal ? "local" as Platform : options.gitPlatform as Platform,
    repo: options.repo,
    commentStyle: options.commentStyle,
    dryRun: isLocal ? true : options.dryRun,
    verbose: options.verbose,
    endpoint: options.modelEndpoint,
    configPath: options.configPath,
    local: isLocal || undefined,
    base: options.base,
    head: options.head,
    patch: options.patch,
    requestTimeout: options.requestTimeout ? parseInt(options.requestTimeout, 10) : undefined,
  });
}

/**
 * Log message if verbose mode is enabled
 */
export function verboseLog(
  options: Partial<ReviewConfig>,
  message: string
): void {
  if (options.verbose) {
    console.log(`[DEBUG] ${message}`);
  }
}

function sanitizeCliOptions(cli: ReviewConfig): Partial<ReviewConfig> {
  return Object.fromEntries(
    Object.entries(cli).filter(([_, v]) => v !== undefined)
  ) as Partial<ReviewConfig>;
}
