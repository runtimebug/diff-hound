# Contributing to Diff Hound

Thanks for your interest in contributing to Diff Hound! This document covers the conventions and workflow you need to follow.

## Getting Started

```bash
git clone https://github.com/runtimebug/diff-hound.git
cd diff-hound
npm install
npm run build
```

### Running Locally

The fastest way to test changes is local diff mode — no GitHub token needed:

```bash
# Review your changes against main
npm run dev -- --local --base main

# Review a patch file
npm run dev -- --patch changes.patch
```

You'll need an `OPENAI_API_KEY` in your `.env` (or another configured provider) for the LLM call.

## Branching Conventions

| Branch | Purpose |
|--------|---------|
| `main` | Stable release branch. Never commit directly to main. |
| `feat/<short-name>` | New features (e.g., `feat/anthropic-adapter`) |
| `fix/<short-name>` | Bug fixes (e.g., `fix/diff-parser-hunk-offset`) |
| `docs/<short-name>` | Documentation changes |
| `refactor/<short-name>` | Code refactoring with no behavior change |
| `chore/<short-name>` | Tooling, CI, dependencies, config |

Always branch off `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/my-feature
```

## Commit Conventions

We follow **Angular Commit Message Conventions**. Every commit message must match this format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons, etc. (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, CI, tooling, dependencies |
| `ci` | CI/CD configuration changes |
| `revert` | Reverting a previous commit |

### Scope

The scope is the module affected. Common scopes:

- `cli` — CLI flags and argument parsing
- `config` — Configuration loading and validation
- `platforms` — Platform adapters (github, local, gitlab)
- `models` — LLM model adapters (openai, anthropic, ollama)
- `core` — Diff parsing, deduplication, token budget
- `types` — Shared type definitions
- `deps` — Dependency updates

### Examples

```
feat(models): add Anthropic Claude adapter

fix(platforms): handle renamed files in local diff parser

docs(readme): add local diff mode usage examples

chore(deps): bump openai from 4.10.0 to 4.20.0

refactor(models): extract shared prompt logic into base class
```

### Breaking Changes

If your change is breaking, add `BREAKING CHANGE:` in the commit footer:

```
feat(types)!: replace severity global config with minSeverity

BREAKING CHANGE: The `severity` field in ReviewConfig is now `minSeverity`.
Per-comment severity is assigned by the LLM.
```

## Pull Request Workflow

### 1. Keep PRs Focused

One PR = one logical change. Don't bundle unrelated changes.

### 2. Squash Commits

All PRs are **squash-merged** into `main`. This means your PR becomes a single commit on main, so:

- You don't need to obsess over individual commit messages during development
- The **PR title** becomes the final commit message — make sure it follows the Angular convention
- The **PR description** becomes the commit body

Example PR title: `feat(platforms): add GitLab platform adapter`

### 3. PR Description

Use this template:

```markdown
## Summary
Brief description of what this PR does and why.

## Changes
- Bullet list of specific changes

## How to Test
Steps to verify the change works:
1. ...
2. ...
```

### 4. Before Submitting

- [ ] Code compiles: `npm run build`
- [ ] Linter passes: `npm run lint`
- [ ] Changes tested locally with `--local` mode where applicable
- [ ] PR title follows Angular commit convention
- [ ] No secrets, API keys, or `.env` files included

### 5. Review Process

- All PRs require at least one approval before merging
- Maintainers may request changes — address feedback in additional commits (they'll be squashed)
- Once approved, a maintainer will squash-merge your PR

## Adding a New Platform Adapter

1. Create `src/platforms/<name>.ts` implementing `CodeReviewPlatform`
2. Add the platform name to the `Platform` type in `src/types/index.ts`
3. Add the case to the factory in `src/platforms/index.ts`
4. Add to the valid platforms list in `src/config/index.ts`

## Adding a New Model Adapter

1. Create `src/models/<name>.ts` implementing `CodeReviewModel`
2. Add the provider name to the `Provider` type in `src/types/index.ts`
3. Add the case to the factory in `src/models/index.ts`
4. Add to the valid providers list in `src/config/index.ts`

## Code Style

- TypeScript strict mode is enabled — no `any` unless absolutely necessary
- Use `const` over `let` where possible
- Error messages should be clear and actionable
- No external dependencies unless they provide significant value — prefer Node.js built-ins
- Follow existing patterns in the codebase (factory methods, adapter interfaces)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
