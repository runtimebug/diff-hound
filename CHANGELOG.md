# diff-hound

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
