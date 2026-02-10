---
description: Create small, logical git commits from staged/unstaged changes
---

# Commit Changes

Create small, logical git commits from the current changes. Follow these rules:

1. **No Claude attribution** - Never include "Co-Authored-By: Claude" or any Claude Code branding
2. **Small commits** - Break changes into logical, focused commits
3. **Conventional commits** - Use format: `type(scope): description`
   - Types: feat, fix, refactor, test, docs, chore, style
4. **Clear messages** - Be specific about what changed and why
5. **Review first** - Show git status and proposed commit breakdown before executing
6. **No local workarounds** - Review code carefully to ensure no temporary/local workarounds are committed:
   - Debug console.logs added for troubleshooting
   - Hardcoded values for local testing
   - Commented-out code blocks
   - Local file paths or environment-specific configurations
   - Test data or temporary test helpers
   - Any @ts-ignore or @ts-expect-error without proper justification

## Process

1. Run `git status` to see all changes
2. Run `git diff` to review the actual changes
3. **Review for workarounds** - Scan modified files for:
   - Debug console.logs
   - Hardcoded test values
   - Temporary code comments
   - Local configurations
   - Unjustified @ts-ignore/@ts-expect-error
4. Group changes by logical area (feature, test, config, etc.)
5. Create commit plan with `type(scope): message` format
6. **Present plan to user for approval**
7. Execute commits one by one with `git add` + `git commit`
8. Show final `git log --oneline -n <count>` of new commits
9. Ask user if they want to push the commits

## Commit Message Format

```
type(scope): brief description

[optional body explaining the "why"]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `test` - Adding or updating tests
- `docs` - Documentation only changes
- `chore` - Maintenance tasks (deps, config, etc.)
- `style` - Formatting, whitespace, etc.

### Examples

- `feat(transactions): add recurring transaction support`
- `fix(auth): resolve Clerk webhook signature validation`
- `refactor(stores): extract playback logic to dedicated hook`
- `chore(deps): update convex to v1.31`
