import { Platform, CodeReviewPlatform } from "../types";
import { GithubPlatform } from "./github";

/**
 * Get platform adapter for the specified platform
 * @param platform Platform to use
 * @returns Platform adapter instance
 */
export async function getPlatform(
  platform: Platform
): Promise<CodeReviewPlatform> {
  switch (platform) {
    case "github":
      return await GithubPlatform.init();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
