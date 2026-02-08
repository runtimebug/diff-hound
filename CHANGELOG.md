# diff-hound

## 1.2.0

### Minor Changes

- a27a62f: Add Ollama model adapter for local, offline AI code reviews. Use `--provider ollama --model llama3` to review code using a locally running Ollama instance. No API key required. Default endpoint is http://localhost:11434.

  Refactor model adapters to use abstract base class (`BaseReviewModel`) with Template Method pattern — shared prompt generation, response parsing, severity/confidence filtering, and file filtering. New adapters only need to implement `callLLM()`.

## 1.1.0

### Minor Changes

- a5662a2: feat(models): implement structured JSON output for OpenAI

  Replace regex-based response parsing with JSON Schema structured output:

  - Add StructuredReviewResponse type with per-comment severity, category, confidence
  - Add JSON Schema (src/schemas/review-response.json) for OpenAI response_format
  - Update OpenAI adapter to use json_schema response format
  - Add validation utilities for structured responses
  - Maintain backward compatibility with legacy free-text parsing as fallback

  This eliminates the fragile regex parsing that could silently drop comments
  if the LLM formatted responses slightly differently.

## 1.0.2

### Patch Changes

- 14defdb: chore: configure changesets and add release workflow
