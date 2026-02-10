---
description: Run full pre-commit validation (static analysis + build)
---

# Validate

Run the complete pre-commit validation suite to ensure code is ready for commit.

## Process

1. Run `bun run static-analysis` (lint + typecheck + knip)
2. If static analysis passes, run `bun run build` to ensure production build succeeds

## Rules

- Stop at first failure and report the errors clearly
- Do not proceed to next step if current step fails
- Report a summary of all results at the end

## Output

```
Validation Results:
- Static Analysis: PASS/FAIL
  - Lint: PASS/FAIL
  - Typecheck: PASS/FAIL
  - Knip: PASS/FAIL
- Build: PASS/FAIL (only if static analysis passed)

Overall: READY / NOT READY
```

If any step fails, provide guidance on how to fix the issues.
