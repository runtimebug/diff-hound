/**
 * Core types for the AI Code Reviewer
 */

// Platforms supported by the tool
export type Platform = "github"; // | "gitlab" | "bitbucket"

// AI models supported by the tool
export type Provider = "openai"; // | "anthropic" | "deepseek" | "groq" | "gemini"

// Configuration for the review process
export interface ReviewConfig {
  provider: Provider;
  model: string;
  gitPlatform: Platform;
  repo?: string;
  commentStyle?: "inline" | "summary";
  dryRun?: boolean;
  verbose?: boolean;
  endpoint?: string;
  configPath?: string;
  severity?: "suggestion" | "warning" | "error";
  ignoreFiles?: string[];
  rules?: string[];
  customPrompt?: string;
}

// Pull Request or Merge Request information
export interface PullRequest {
  id: string | number;
  number?: number;
  title: string;
  description?: string;
  author: string;
  branch: string;
  baseBranch: string;
  commits?: string[];
  updatedAt: Date;
  url?: string;
}

// Information about files changed in a PR
export interface FileChange {
  filename: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch?: string; // The diff content
  previousFilename?: string; // For renamed files
}

// A comment to be posted by the AI
export interface AIComment {
  type: "inline" | "summary";
  path?: string;
  line?: number;
  content: string;
  suggestions?: string[];
  severity?: "suggestion" | "warning" | "error";
  created_at?: string;
}

// Interface for platform adapters
export interface CodeReviewPlatform {
  getPullRequests(repo: string): Promise<PullRequest[]>;
  getPullRequestDiff(
    repo: string,
    prId: string | number
  ): Promise<FileChange[]>;
  postComment(
    repo: string,
    prId: string | number,
    comment: AIComment
  ): Promise<void>;
  hasAICommented(repo: string, prId: string | number): Promise<boolean>;
}

// Interface for AI model adapters
export interface CodeReviewModel {
  review(diff: FileChange[], config: ReviewConfig): Promise<AIComment[]>;
}

// Result from a review operation
export interface ReviewResult {
  prId: string | number;
  commentsPosted: number;
  status: "success" | "failure" | "skipped";
  error?: string;
}
