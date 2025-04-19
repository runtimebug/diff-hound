import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Platform, ReviewConfig } from "../types";

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: ReviewConfig = {
  provider: "openai",
  model: "gpt-4o",
  gitPlatform: "github",
  commentStyle: "inline",
  dryRun: false,
  verbose: false,
  severity: "suggestion",
  ignoreFiles: [],
};

/**
 * Load configuration from file
 * @param configPath Optional path to config file
 * @returns Review configuration
 */
export async function loadConfig(configPath?: string): Promise<ReviewConfig> {
  // If config path is specified, use it
  if (configPath && fs.existsSync(configPath)) {
    return loadConfigFromFile(configPath);
  }

  // Otherwise, look for default config files
  const jsonConfigPath = path.resolve(process.cwd(), ".aicodeconfig.json");
  const yamlConfigPath = path.resolve(process.cwd(), ".aicode.yml");

  if (fs.existsSync(jsonConfigPath)) {
    return loadConfigFromFile(jsonConfigPath);
  }

  if (fs.existsSync(yamlConfigPath)) {
    return loadConfigFromFile(yamlConfigPath);
  }

  // Return default config if no config file is found
  return { ...DEFAULT_CONFIG };
}

/**
 * Load configuration from a specific file
 * @param filePath Path to config file
 * @returns Review configuration
 */
function loadConfigFromFile(filePath: string): ReviewConfig {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    let config: Partial<ReviewConfig>;

    if (filePath.endsWith(".json")) {
      config = JSON.parse(fileContent);
    } else if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
      config = yaml.load(fileContent) as Partial<ReviewConfig>;
    } else {
      throw new Error(`Unsupported config file format: ${filePath}`);
    }

    // Merge with default config
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error(`Error loading config from ${filePath}: ${error}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Validates the configuration : CLI options && config file
 * @param cliOptions CLI options from command line
 * @param config Configuration from file
 * @returns Updated configuration
 */
export function validateConfig(
  cliOptions: Partial<ReviewConfig>,
  config: ReviewConfig
): ReviewConfig {
  let finalConfig: ReviewConfig = { ...config, ...cliOptions };

  // Validate provider
  // Todo: Add more providers as needed ("anthropic", "deepseek", "groq", "gemini")
  const validProviders: string[] = ["openai"];
  if (!validProviders.includes(finalConfig.provider)) {
    console.error(
      `Error: Invalid provider '${finalConfig.provider}'. Using default: ${DEFAULT_CONFIG.provider}`
    );
    finalConfig.provider = DEFAULT_CONFIG.provider;
  }

  // Validate platform
  // Todo: Add more platforms as needed ("gitlab", "bitbucket")
  const validPlatforms: Platform[] = ["github"];
  if (!validPlatforms.includes(finalConfig.gitPlatform)) {
    console.error(
      `Error: Invalid platform '${finalConfig.gitPlatform}'. Using default: ${DEFAULT_CONFIG.gitPlatform}`
    );
    finalConfig.gitPlatform = DEFAULT_CONFIG.gitPlatform;
  }

  // Validate severity
  if (
    finalConfig.severity &&
    !["suggestion", "warning", "error"].includes(finalConfig.severity)
  ) {
    console.warn(
      `Warning: Invalid severity '${finalConfig.severity}' in config file. Using default: ${DEFAULT_CONFIG.severity}`
    );
    finalConfig.severity = DEFAULT_CONFIG.severity;
  }

  return finalConfig;
}
