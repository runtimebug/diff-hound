import { Platform, CodeReviewPlatform, ReviewConfig } from "../types";
import { GithubPlatform } from "./github";
import { LocalPlatform } from "./local";

/**
 * Get platform adapter for the specified platform
 * @param platform Platform to use
 * @param config Full review config (needed for local platform options)
 * @returns Platform adapter instance
 */
export async function getPlatform(
  platform: Platform,
  config?: ReviewConfig
): Promise<CodeReviewPlatform> {
  switch (platform) {
    case "github":
      return await GithubPlatform.init();
    case "local":
      if (!config) {
        throw new Error("ReviewConfig is required for local platform");
      }
      return await LocalPlatform.create(config);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
