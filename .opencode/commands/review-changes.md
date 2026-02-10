---
description: Review modified files for TypeScript standards, code quality, and production readiness
---

# Review Changes

Review all modified files in the current branch, enforcing TypeScript standards, removing duplicated code, improving composability, and ensuring production-ready quality.

## Pre-Review Checks

1. Run `bun run static-analysis` to identify violations
2. Run `git diff main...HEAD` to identify all modified files
3. Check for common patterns across files that could be consolidated

## Review Scope

- Review every file added or modified in this branch
- Enforce project TypeScript and code quality standards
- Identify opportunities for composability and reusability
- Find duplicated code and suggest shared patterns
- Clean up development artifacts
- Suggest architectural improvements

## TypeScript Standards (CRITICAL)

**Zero-tolerance enforcement from CLAUDE.md:**

1. **No `any` types** - Replace with proper types or specific interfaces
2. **No `unknown` without type guards** - Use explicit types
3. **Explicit function signatures** - All parameters and return types declared
4. **Component props interfaces** - Every component must have typed props
5. **Event handlers** - Properly typed (e.g., `React.FormEvent<HTMLFormElement>`)
6. **Convex functions** - Explicit return types and proper validators
7. **Import aliases** - Use `@/*` for src imports
8. **No unused variables** - No underscore prefixes to bypass lint

## Code Quality Standards

### Remove Development Artifacts

- Console.log statements (unless intentional logging)
- Commented-out code blocks
- TODO/FIXME without linked issues
- Mock data or test stubs
- Debug-only code paths
- Hardcoded development URLs/credentials

### Remove Noise Comments

- Obvious comments that repeat code
- Outdated comments
- Placeholder comments
- Auto-generated boilerplate comments

### Keep Useful Documentation

- JSDoc for complex functions or non-obvious logic
- Type documentation that aids IDE hints
- Important business logic explanations

## Refactoring Priorities

### 1. Composability

- Extract repeated JSX patterns into components
- Create reusable hooks for shared logic
- Build utility functions for common operations
- Use composition over duplication

### 2. Remove Duplication

- Identify identical or similar code blocks
- Extract shared logic into utilities/hooks
- Create shared components for repeated UI patterns
- Consolidate similar type definitions

### 3. Architectural Improvements

- Suggest better separation of concerns
- Identify opportunities for custom hooks
- Recommend better state management patterns
- Point out potential performance issues

### 4. Convex Patterns

- Ensure proper `authQuery`/`authMutation` wrappers
- Use new table-name-first syntax for `ctx.db` methods
- Proper argument validators
- Organization-scoped queries (all data must be scoped by organizationId)

### 5. Styling Patterns

- Use `cn()` utility for conditional classes (never template literals)
- Use `class-variance-authority` for component variants
- No inline styles (use Tailwind)
- No gradients (per CLAUDE.md)

## Output Format

### 1. Pre-Review Summary

- Static analysis results
- List of modified files
- Initial pattern analysis

### 2. Issues Found

Group by severity:

- **CRITICAL**: Type safety violations (`any`, missing types)
- **HIGH**: Duplicated code, missing composability, security issues
- **MEDIUM**: Code quality issues, missing documentation
- **LOW**: Style inconsistencies, minor improvements

### 3. Refactoring Suggestions

For each opportunity:

- What code is duplicated/repeated
- Proposed extraction (component/hook/utility)
- Expected benefits
- Implementation approach

### 4. File-by-File Review

For each file with issues:

- Summary of problems
- Specific line references
- Suggested fixes

### 5. Follow-up Recommendations

- Architectural improvements to consider
- Potential performance optimizations
- Documentation needs

## Constraints

- Maintain exact production functionality
- Do NOT introduce breaking changes
- Keep external APIs and function signatures stable
- All suggestions must pass `bun run static-analysis`
