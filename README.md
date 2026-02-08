# Diff Hound

Diff Hound is an automated AI-powered code review tool that posts intelligent, contextual comments directly on pull requests across supported platforms.

Supports GitHub today. GitLab and Bitbucket support are planned.

---

## ✨ Features

- 🧠 Automated code review using OpenAI (Upcoming: Claude, DeepSeek, CodeLlama)
- 💬 Posts inline or summary comments on pull requests
- 🔌 Plug-and-play architecture for models and platforms
- ⚙️ Configurable with JSON/YAML config files and CLI overrides
- 🛠️ Designed for CI/CD pipelines and local runs
- 🧐 Tracks last reviewed commit to avoid duplicate reviews
- 🖥️ Local diff mode — review local changes without a remote PR

---

## 🛠️ Installation

### Option 1: Install via npm

```bash
npm install -g diff-hound
```

### Option 2: Install from source

```bash
git clone https://github.com/runtimebug/diff-hound.git
cd diff-hound
npm install
npm run build
npm link
```

---

## 🚀 How to Use

### Step 1: Setup Environment Variables

Copy the provided `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Then modify with your keys / tokens:

```env
# Platform tokens
GITHUB_TOKEN=your_github_token # Requires 'repo' scope

# AI Model API keys
OPENAI_API_KEY=your_openai_key
```

> 🔐 `GITHUB_TOKEN` is used to fetch PRs and post comments – [get it here](https://github.com/settings/personal-access-tokens)  
> 🔐 `OPENAI_API_KEY` is used to generate code reviews via GPT – [get it here](https://platform.openai.com/api-keys)

---

### Step 2: Create a Config File

You can define your config in `.aicodeconfig.json` or `.aicode.yml`:

#### JSON Example (`.aicodeconfig.json`)

```json
{
  "provider": "openai",
  "model": "gpt-4o", // Or any other openai model
  "endpoint": "", // Optional: custom endpoint
  "gitProvider": "github",
  "repo": "your-username/your-repo",
  "dryRun": false,
  "verbose": false,
  "rules": [
    "Prefer const over let when variables are not reassigned",
    "Avoid reassigning const variables",
    "Add descriptive comments for complex logic",
    "Remove unnecessary comments",
    "Follow the DRY (Don't Repeat Yourself) principle",
    "Use descriptive variable and function names",
    "Handle errors appropriately",
    "Add type annotations where necessary"
  ],
  "ignoreFiles": ["*.md", "package-lock.json", "yarn.lock", "LICENSE", "*.log"],
  "commentStyle": "inline",
  "severity": "suggestion"
}
```

#### YAML Example (`.aicode.yml`)

```yaml
provider: openai
model: gpt-4o # Or any other openai model
endpoint: "" # Optional: custom endpoint
gitProvider: github
repo: your-username/your-repo
dryRun: false
verbose: false
commentStyle: inline
severity: suggestion
ignoreFiles:
  - "*.md"
  - package-lock.json
  - yarn.lock
  - LICENSE
  - "*.log"
rules:
  - Prefer const over let when variables are not reassigned
  - Avoid reassigning const variables
  - Add descriptive comments for complex logic
  - Remove unnecessary comments
  - Follow the DRY (Don't Repeat Yourself) principle
  - Use descriptive variable and function names
  - Handle errors appropriately
  - Add type annotations where necessary
```

---

### Step 3: Run It

```bash
diff-hound
```

Or override config values via CLI:

```bash
diff-hound --repo=owner/repo --provider=openai --model=gpt-4o --dry-run
```

> Add `--dry-run` to **print comments to console** instead of posting them.

---

### Local Diff Mode

Review local git changes without a remote PR or GitHub token. Only an LLM API key is needed.

```bash
# Review changes between current branch and main
diff-hound --local --base main

# Review last commit
diff-hound --local --base HEAD~1

# Review changes between two specific refs
diff-hound --local --base main --head feature-branch

# Review a patch file directly
diff-hound --patch changes.patch
```

Local mode always runs in dry-run — output goes to your terminal. If `--base` is omitted, it defaults to the upstream tracking branch or `HEAD~1`.

---

### Output Example (Dry Run)

```bash
== Comments for PR #42: Fix input validation ==

src/index.ts:17 —
Prefer `const` over `let` since `userId` is not reassigned.

src/utils/parse.ts:45 —
Consider refactoring to reduce nesting.
```

---

### Optional CLI Flags

| Flag               | Short | Description                             |
| ------------------ | ----- | --------------------------------------- |
| `--provider`       | `-p`  | AI model provider (e.g. `openai`)       |
| `--model`          | `-m`  | AI model (e.g. `gpt-4o`, `gpt-4`, etc.) |
| `--model-endpoint` | `-e`  | Custom API endpoint for the model       |
| `--git-provider`   | `-g`  | Repo platform (default: `github`)       |
| `--repo`           | `-r`  | GitHub repo in format `owner/repo`      |
| `--comment-style`  | `-s`  | `inline` or `summary`                   |
| `--dry-run`        | `-d`  | Don't post comments, only print         |
| `--verbose`        | `-v`  | Enable debug logs                       |
| `--config-path`    | `-c`  | Custom config file path                 |
| `--local`          | `-l`  | Review local git diff (always dry-run)  |
| `--base`           |       | Base ref for local diff (branch/commit) |
| `--head`           |       | Head ref for local diff (default: HEAD) |
| `--patch`          |       | Path to a patch file (implies `--local`)|

---

## 🛠️ Development

### Project Structure

```
diff-hound/
├── bin/                  # CLI entrypoint
├── src/
│   ├── cli/              # CLI argument parsing
│   ├── config/           # JSON/YAML config handling
│   ├── core/             # Diff parsing, formatting
│   ├── models/           # AI model adapters
│   ├── platforms/        # GitHub, GitLab, etc.
│   └── types/            # TypeScript types
├── .env
├── README.md
```

---

### Add Support for New AI Models

Create a new class in `src/models/` that implements the `CodeReviewModel` interface.

---

### Add Support for New Platforms

Create a new class in `src/platforms/` that implements the `CodeReviewPlatform` interface.

---

## ✅ Next Steps

🔧 Structured logging (pino)
🌐 GitLab and Bitbucket platform adapters
🌍 Anthropic, Ollama, and Gemini model adapters
📤 Webhook server mode and GitHub Action
🧪 Vitest test suite
📦 Docker image for self-hosting
🧩 Plugin system with pipeline hooks
🧠 Repo indexing and context-aware reviews

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Branching and commit conventions (Angular style)
- PR workflow (squash-merge)
- How to add new platform and model adapters

---

## 📜 License

MIT – Use freely, contribute openly.
