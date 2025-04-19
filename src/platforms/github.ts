import {
  CodeReviewPlatform,
  PullRequest,
  FileChange,
  AIComment,
} from "../types";

import { components } from "@octokit/openapi-types";

// GitHub's issue/review comment type from OpenAPI schema
type IssueComment = components["schemas"]["issue-comment"];
type ReviewComment = components["schemas"]["pull-request-review-comment"];
type GithubPullRequest = components["schemas"]["pull-request"];
type PullRequestFile = components["schemas"]["diff-entry"];

/**
 * GitHub platform adapter
 */
export class GithubPlatform implements CodeReviewPlatform {
  private client: any; // Octokit is dynamically loaded
  private commentSignature = "<!-- DIFF-HOUND-BOT -->";

  private constructor(client: any) {
    this.client = client;
  }

  static async init(): Promise<GithubPlatform> {
    const { Octokit } = await import("@octokit/rest");

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    const client = new Octokit({ auth: token });
    return new GithubPlatform(client);
  }

  /**
   * Extract owner and repo from repo string
   * @param repo Repository in format "owner/repo"
   * @returns Object with owner and repo properties
   */
  private parseRepo(repo: string): { owner: string; repo: string } {
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      throw new Error(
        `Invalid repository format: ${repo}. Expected format: owner/repo`
      );
    }
    return { owner, repo: repoName };
  }

  /**
   * Get all open pull requests for a repository
   * @param repo Repository in format "owner/repo"
   * @returns List of pull requests
   */
  async getPullRequests(repo: string): Promise<PullRequest[]> {
    const { owner, repo: repoName } = this.parseRepo(repo);

    const { data: pulls } = await this.client.pulls.list({
      owner,
      repo: repoName,
      state: "open",
      sort: "updated",
      direction: "desc",
    });

    return pulls.map((pull: GithubPullRequest) => ({
      id: pull.number,
      number: pull.number,
      title: pull.title,
      description: pull.body || undefined,
      author: pull.user?.login || "unknown",
      branch: pull.head.ref,
      baseBranch: pull.base.ref,
      updatedAt: new Date(pull.updated_at),
      url: pull.html_url,
    }));
  }

  /**
   * Get the diff for a pull request
   * @param repo Repository in format "owner/repo"
   * @param prId Pull request ID
   * @returns List of file changes
   */
  async getPullRequestDiff(
    repo: string,
    prId: string | number
  ): Promise<FileChange[]> {
    const { owner, repo: repoName } = this.parseRepo(repo);

    const { data: files } = await this.client.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: Number(prId),
    });

    return files.map((file: PullRequestFile) => ({
      filename: file.filename,
      status: file.status as any,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch || undefined,
      previousFilename: file.previous_filename,
    }));
  }

  /**
   * Post a comment on a pull request
   * @param repo Repository in format "owner/repo"
   * @param prId Pull request ID
   * @param comment Comment to post
   */
  async postComment(
    repo: string,
    prId: string | number,
    comment: AIComment
  ): Promise<void> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const pullNumber = Number(prId);

    const { data: pull } = await this.client.pulls.get({
      owner,
      repo: repoName,
      pull_number: pullNumber,
    });

    if (comment.type === "inline" && comment.path && comment.line) {
      // Post inline comment
      await this.client.pulls.createReviewComment({
        owner,
        repo: repoName,
        pull_number: pullNumber,
        body: `${comment.content}\n\n${this.commentSignature}\n<!-- SHA: ${pull.head.sha} -->`,
        commit_id: pull.head.sha,
        path: comment.path,
        line: comment.line,
      });
    } else {
      // Post PR comment
      await this.client.issues.createComment({
        owner,
        repo: repoName,
        issue_number: pullNumber,
        body: `${comment.content}\n\n${this.commentSignature}\n<!-- SHA: ${pull.head.sha} -->`,
      });
    }
  }

  /**
   * Checks if the AI has already commented on the latest commit of a pull request
   * @param repo Repository in format "owner/repo"
   * @param prId Pull request ID
   * @returns True if the AI has commented, false otherwise
   */
  async hasAICommented(repo: string, prId: string | number): Promise<boolean> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const pullNumber = Number(prId);

    const { data: pull } = await this.client.pulls.get({
      owner,
      repo: repoName,
      pull_number: pullNumber,
    });

    const latestCommitSha = pull.head.sha;

    // --- Get issue (summary) comments
    const issueComments = (await this.client.paginate(
      this.client.issues.listComments.endpoint.merge({
        owner,
        repo: repoName,
        issue_number: pullNumber,
        per_page: 100,
      })
    )) as IssueComment[];

    // --- Get review (inline) comments
    const reviewComments = (await this.client.paginate(
      this.client.pulls.listReviewComments.endpoint.merge({
        owner,
        repo: repoName,
        pull_number: pullNumber,
        per_page: 100,
      })
    )) as ReviewComment[];

    const allComments = [...issueComments, ...reviewComments];

    const reviewedShas = allComments
      .filter((c) => c.body?.includes(this.commentSignature))
      .map((c) => {
        const match = c.body?.match(/<!-- SHA: (.+?) -->/);
        return match?.[1];
      })
      .filter(Boolean);

    return reviewedShas.includes(latestCommitSha);
  }
}
