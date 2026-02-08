import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  CodeReviewPlatform,
  PullRequest,
  FileChange,
  AIComment,
  ReviewConfig,
} from "../types";

const execFileAsync = promisify(execFile);

/**
 * Local platform adapter — reviews local git diffs without any remote API calls.
 * Always operates in dry-run mode (output to stdout).
 */
export class LocalPlatform implements CodeReviewPlatform {
  private repoPath: string;
  private base: string;
  private head: string;
  private patchFile?: string;

  constructor(config: ReviewConfig) {
    this.repoPath = process.cwd();
    this.base = config.base || "";
    this.head = config.head || "HEAD";
    this.patchFile = config.patch;
  }

  static async create(config: ReviewConfig): Promise<LocalPlatform> {
    const platform = new LocalPlatform(config);

    // If using a patch file, validate it exists
    if (platform.patchFile) {
      const patchPath = path.resolve(platform.patchFile);
      if (!fs.existsSync(patchPath)) {
        throw new Error(`Patch file not found: ${patchPath}`);
      }
      platform.patchFile = patchPath;
      return platform;
    }

    // Validate we're in a git repo
    try {
      await execFileAsync("git", ["rev-parse", "--git-dir"], {
        cwd: platform.repoPath,
      });
    } catch {
      throw new Error(
        `Not a git repository: ${platform.repoPath}. ` +
          "Run this command from inside a git repository."
      );
    }

    // Resolve base ref if not provided
    if (!platform.base) {
      platform.base = await platform.resolveDefaultBase();
    }

    // Validate refs exist
    await platform.validateRef(platform.base);
    await platform.validateRef(platform.head);

    return platform;
  }

  /**
   * Determine a sensible default base ref:
   * 1. If current branch has an upstream, use the merge base with it
   * 2. Otherwise, use HEAD~1
   */
  private async resolveDefaultBase(): Promise<string> {
    try {
      // Try to get the upstream tracking branch
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        { cwd: this.repoPath }
      );
      const upstream = stdout.trim();
      if (upstream) {
        // Use merge-base for a cleaner diff
        const { stdout: mergeBase } = await execFileAsync(
          "git",
          ["merge-base", upstream, this.head],
          { cwd: this.repoPath }
        );
        return mergeBase.trim();
      }
    } catch {
      // No upstream — fall through
    }

    // Fallback: diff against previous commit
    return "HEAD~1";
  }

  private async validateRef(ref: string): Promise<void> {
    try {
      await execFileAsync("git", ["rev-parse", "--verify", ref], {
        cwd: this.repoPath,
      });
    } catch {
      throw new Error(
        `Invalid git ref: '${ref}'. Make sure it exists in this repository.`
      );
    }
  }

  /**
   * Returns a single synthetic PullRequest from local git metadata.
   */
  async getPullRequests(_repo: string): Promise<PullRequest[]> {
    if (this.patchFile) {
      return [
        {
          id: "local-patch",
          number: 0,
          title: `Patch: ${path.basename(this.patchFile)}`,
          author: "local",
          branch: "patch-file",
          baseBranch: "N/A",
          updatedAt: new Date(),
        },
      ];
    }

    // Get current branch name
    let branch = "unknown";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: this.repoPath }
      );
      branch = stdout.trim();
    } catch {
      // Detached HEAD — use commit hash
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["rev-parse", "--short", "HEAD"],
          { cwd: this.repoPath }
        );
        branch = stdout.trim();
      } catch {
        // ignore
      }
    }

    // Get a short description from the latest commit
    let title = `Local diff: ${this.base}...${this.head}`;
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "--format=%s", "-1", this.head],
        { cwd: this.repoPath }
      );
      title = stdout.trim() || title;
    } catch {
      // ignore
    }

    // Get author
    let author = "local";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["config", "user.name"],
        { cwd: this.repoPath }
      );
      author = stdout.trim() || author;
    } catch {
      // ignore
    }

    return [
      {
        id: "local",
        number: 0,
        title,
        author,
        branch,
        baseBranch: this.base,
        updatedAt: new Date(),
      },
    ];
  }

  /**
   * Get file changes by running `git diff` or reading a patch file.
   */
  async getPullRequestDiff(
    _repo: string,
    _prId: string | number
  ): Promise<FileChange[]> {
    let diffOutput: string;

    if (this.patchFile) {
      diffOutput = fs.readFileSync(this.patchFile, "utf-8");
    } else {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", `${this.base}...${this.head}`, "--unified=3"],
        { cwd: this.repoPath, maxBuffer: 10 * 1024 * 1024 }
      );
      diffOutput = stdout;
    }

    if (!diffOutput.trim()) {
      return [];
    }

    return this.parseGitDiff(diffOutput);
  }

  /**
   * Parse raw `git diff` output into FileChange objects.
   * This parses the full unified diff format including file headers.
   */
  private parseGitDiff(diffOutput: string): FileChange[] {
    const files: FileChange[] = [];
    // Split on diff headers: "diff --git a/path b/path"
    const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split("\n");

      // Parse the file paths from the first line: "a/path b/path"
      const headerMatch = lines[0].match(/^a\/(.+?)\s+b\/(.+)$/);
      if (!headerMatch) continue;

      const oldPath = headerMatch[1];
      const newPath = headerMatch[2];

      // Determine status from the diff metadata lines
      let status: FileChange["status"] = "modified";
      let previousFilename: string | undefined;

      for (const line of lines.slice(1)) {
        if (line.startsWith("new file")) {
          status = "added";
          break;
        } else if (line.startsWith("deleted file")) {
          status = "deleted";
          break;
        } else if (line.startsWith("rename from")) {
          status = "renamed";
          previousFilename = oldPath;
          break;
        } else if (line.startsWith("@@")) {
          break; // No more metadata lines
        }
      }

      // Extract the patch content (from first @@ to end)
      const patchStartIdx = fileDiff.indexOf("\n@@");
      let patch: string | undefined;
      if (patchStartIdx !== -1) {
        patch = fileDiff.substring(patchStartIdx + 1); // +1 to skip the leading \n
      }

      // Count additions and deletions from the patch
      let additions = 0;
      let deletions = 0;
      if (patch) {
        for (const patchLine of patch.split("\n")) {
          if (patchLine.startsWith("+") && !patchLine.startsWith("+++")) {
            additions++;
          } else if (
            patchLine.startsWith("-") &&
            !patchLine.startsWith("---")
          ) {
            deletions++;
          }
        }
      }

      files.push({
        filename: newPath,
        status,
        additions,
        deletions,
        patch,
        previousFilename,
      });
    }

    return files;
  }

  /**
   * In local mode, "posting" a comment means printing to stdout.
   */
  async postComment(
    _repo: string,
    _prId: string | number,
    _comment: AIComment
  ): Promise<void> {
    // Local mode output is handled in main — this is a no-op.
    // The main loop already handles dry-run printing.
  }

  /**
   * Always returns false — no duplicate tracking in local mode.
   */
  async hasAICommented(
    _repo: string,
    _prId: string | number
  ): Promise<boolean> {
    return false;
  }
}
