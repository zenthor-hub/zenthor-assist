---
description: Fix all static analysis issues (linting, type checking, dead code detection)
---

# Fix Static Analysis Issues

Automatically identify and fix all issues found by the static analysis suite (`bun run static-analysis`).

## Process

### 1. Run Static Analysis

- Execute `bun run static-analysis` to identify all issues
- This includes: linting (oxlint), formatting (oxfmt), type checking (TypeScript), dead code detection (Knip)

### 2. Analyze Issues

- Parse the output to categorize issues by type and file
- Prioritize critical issues (type errors, syntax errors) over style issues
- Group related issues for efficient fixing

### 3. Apply Fixes Automatically

- **Lint/format issues**: Run `bun run check:fix` for auto-fixable linting and formatting issues
- **Knip issues**: Run `bun run knip:fix` for auto-fixable dead code removal
- **TypeScript issues**: Apply targeted fixes for common patterns

### 4. Manual Fixes (if auto-fix fails)

- Fix remaining type errors by adding proper type annotations
- Remove unused imports, variables, and functions
- Fix linting issues that require code changes
- Update imports to match refactored code

### 5. Verify Fixes

- Re-run `bun run static-analysis` to confirm all issues are resolved
- Report any remaining issues that require manual intervention

## Rules

- **Never suppress errors** with `@ts-ignore`, `@ts-expect-error`, or `as any`
- **Fix root causes** rather than symptoms
- **Maintain code functionality** - ensure fixes don't break existing behavior
- **Follow project conventions** from CLAUDE.md and existing codebase patterns
- **Report unfixable issues** clearly with suggested next steps

## Output Format

```
Static Analysis Fix Results:
- Initial issues found: X lint, Y type, Z dead code
- Auto-fixed: A issues
- Manual fixes applied: B issues
- Remaining issues: C (requiring manual review)

Status: SUCCESS / PARTIAL / REQUIRES_MANUAL_REVIEW

[If issues remain, list them with file locations and brief descriptions]
```

## Common Fix Patterns

- **Unused imports**: Remove import statements
- **Unused variables**: Remove or prefix with `_` if needed for side effects
- **Type errors**: Add proper type annotations or imports
- **oxfmt formatting**: Apply consistent formatting and import sorting
- **Dead code**: Remove unreachable or unused code paths
