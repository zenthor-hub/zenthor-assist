# Release process

## Overview

This repository now uses workspace-scoped release artifacts driven by Conventional Commits and GitHub Releases.

- Workspace versions are tracked in each workspace changelog:
  - `apps/agent/CHANGELOG.md`
  - `apps/backend/CHANGELOG.md`
  - `apps/web/CHANGELOG.md`
- Monorepo release history is tracked in `CHANGELOG.md`.

## SemVer and release scope

- Versioning uses semantic versions (`major.minor.patch`).
- Releases are scoped by workspace:
  - `agent-vX.Y.Z`
  - `backend-vX.Y.Z`
  - `web-vX.Y.Z`

## Release command (local dry run)

```bash
bun run release -- --workspace agent --bump patch --dry-run
```

Valid workspaces are `agent`, `backend`, and `web`.

## Release command (actual)

```bash
bun run release -- --workspace agent --bump patch
```

## Output

- Workspace package version bump in `apps/<workspace>/package.json`
- Release section added to `apps/<workspace>/CHANGELOG.md`
- Root changelog index updated in `CHANGELOG.md`
- Release notes file generated: `.github/release-notes/<workspace>-v<version>.md`
- GitHub tag and release with body from generated notes

## Release command output details

The release command:

- calculates the next version from current package version,
- updates the workspace `package.json` version,
- writes a release section to that workspace changelog,
- updates the monorepo `CHANGELOG.md` release index,
- emits release metadata for CI (tag, commit count, release notes path).

## Notes for GitHub releases

Use the release workflow (manual dispatch):

- `workspace` (agent | backend | web)
- `bump` (patch | minor | major)

The workflow:

1. runs `bun run release` for the selected workspace,
2. commits changelog/version changes,
3. tags `workspace-vX.Y.Z`,
4. creates a GitHub release with generated notes.
