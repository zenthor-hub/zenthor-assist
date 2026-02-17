# Changelog

All notable changes to the zenthor-assist monorepo are documented here.

## [Unreleased]

- Added initial AI SDK v6 migration updates in the agent runtime:
  - Added model-level telemetry capture and logging for finish reasons and usage.
  - Added optional structured tool invocation constraints (`strict`) and example payloads from plugin descriptors.
  - Added AI SDK experimental telemetry metadata propagation (`AI_SDK_TELEMETRY`) for generation calls.
  - Added configurable env toggles: `AI_TOOL_STRICT`, `AI_TOOL_INPUT_EXAMPLES`, `AI_SDK_TELEMETRY`.
- Added built-in plugin-level tool descriptors for safer model behavior and better tool validation guidance.

## Workspace release index

- `agent` — latest release is `1.0.0`
- `backend` — latest release is `1.0.0`
- `web` — latest release is `0.1.0`
