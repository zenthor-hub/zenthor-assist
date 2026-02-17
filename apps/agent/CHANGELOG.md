# Changelog

## [Unreleased]

- Added AI SDK v6 generation updates:
  - Added model telemetry extraction (finish reason + usage totals) and completion logs for better observability.
  - Added optional `experimental_telemetry` metadata on generation calls via `AI_SDK_TELEMETRY`.
  - Added tool contract enhancements for built-in tools: `strict` and `inputExamples` for plugin descriptors.
- Added support flags in `packages/env` for:
  - `AI_TOOL_STRICT`
  - `AI_TOOL_INPUT_EXAMPLES`
  - `AI_SDK_TELEMETRY`
- Enriched built-in plugin manifests with structured tool descriptors and usage examples.

## [1.0.0] - 2026-02-12

### Changed

- Initial release tracking initialized.
