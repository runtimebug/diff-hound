---
"diff-hound": minor
---

Add Ollama model adapter for local, offline AI code reviews. Use `--provider ollama --model llama3` to review code using a locally running Ollama instance. No API key required. Default endpoint is http://localhost:11434.

Refactor model adapters to use abstract base class (`BaseReviewModel`) with Template Method pattern — shared prompt generation, response parsing, severity/confidence filtering, and file filtering. New adapters only need to implement `callLLM()`.
