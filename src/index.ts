import { parseCli, verboseLog } from "./cli";
import { loadConfig, validateConfig } from "./config";
import { getPlatform } from "./platforms";
import { getModel } from "./models";
import { ReviewConfig, ReviewResult } from "./types";
import { parseUnifiedDiff } from "./core/parseUnifiedDiff";

async function main(): Promise<void> {
  try {
    // Parse CLI options
    const cliOptions = parseCli();
    verboseLog(cliOptions, "CLI options parsed");

    // Load configuration
    const fileConfig = await loadConfig(cliOptions.configPath);
    verboseLog(
      cliOptions,
      `Configuration loaded from ${cliOptions.configPath || "default"}`
    );

    // Merge CLI options with config
    const config = validateConfig(cliOptions, fileConfig);
    verboseLog(config, `Bot configuration: ${JSON.stringify(config, null, 2)}`);

    // Get platform adapter
    const platform = await getPlatform(config.gitPlatform);
    verboseLog(config, `Using platform: ${config.gitPlatform}`);

    // Get model adapter
    const model = getModel(config.provider, config.model, config.endpoint);
    verboseLog(config, `Using model: ${config.model}`);

    // Ensure repository is specified
    if (!config.repo) {
      console.error(
        "Error: Repository is not specified. Please add it to the config file or use the --repo CLI option."
      );
      process.exit(1);
    }

    // Get pull requests that need review
    const pullRequests = await platform.getPullRequests(config.repo);
    verboseLog(config, `Found ${pullRequests.length} PRs`);

    if (pullRequests.length === 0) {
      console.log("No pull requests found that need review");
      return;
    }

    // Process each pull request
    const results: ReviewResult[] = [];

    for (const pr of pullRequests) {
      verboseLog(config, `Processing PR #${pr.number}: ${pr.title}`);

      // Check if AI has already commented since the last update
      const hasCommented = await platform.hasAICommented(config.repo, pr.id);

      if (hasCommented) {
        verboseLog(
          config,
          `Skipping PR #${pr.number} - already reviewed since last update`
        );
        results.push({
          prId: pr.id,
          commentsPosted: 0,
          status: "skipped",
        });
        continue;
      }

      try {
        // Get PR diff
        const diff = await platform.getPullRequestDiff(config.repo, pr.id);
        verboseLog(
          config,
          `Got diff for PR #${pr.number} with ${diff.length} changed files`
        );

        const parsedDiff = parseUnifiedDiff(diff);
        verboseLog(
          config,
          `Parsed diff for PR #${pr.number} with ${diff.length} changed files`
        );

        // Get AI review
        const comments = await model.review(parsedDiff, config);
        verboseLog(
          config,
          `Generated ${comments.length} comments for PR #${pr.number}`
        );

        if (cliOptions.dryRun) {
          // Just print comments in dry run mode
          console.log(`\n== Comments for PR #${pr.number}: ${pr.title} ==`);
          comments.forEach((comment) => {
            console.log(
              `\n${
                comment.type === "inline"
                  ? `${comment.path}:${comment.line}`
                  : "Summary comment"
              }:`
            );
            console.log(comment.content);
          });
        } else {
          // Post comments to PR
          for (const comment of comments) {
            await platform.postComment(config.repo, pr.id, comment);
          }
          console.log(`Posted ${comments.length} comments to PR #${pr.number}`);
        }

        results.push({
          prId: pr.id,
          commentsPosted: comments.length,
          status: "success",
        });
      } catch (error) {
        console.error(`Error processing PR #${pr.number}: ${error}`);
        results.push({
          prId: pr.id,
          commentsPosted: 0,
          status: "failure",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Print summary
    console.log("\n== Review Summary ==");
    console.log(`Total PRs: ${pullRequests.length}`);
    console.log(
      `Reviewed: ${results.filter((r) => r.status === "success").length}`
    );
    console.log(
      `Skipped: ${results.filter((r) => r.status === "skipped").length}`
    );
    console.log(
      `Failed: ${results.filter((r) => r.status === "failure").length}`
    );
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error(`Unhandled error: ${error}`);
  process.exit(1);
});
