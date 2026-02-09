---
description: Summarize unresolved PR comments with recommended actions
---

# PR Comments Review

Fetch and summarize all unresolved comments on the current PR, providing clear recommended actions for each.

## Process

### 1. Identify the PR

- Run `gh pr view --json number,url,title` to get current branch's PR
- If no PR exists, inform user and stop
- Display PR title and URL for context

### 2. Fetch All Review Comments

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews --jq '.[] | select(.state != "DISMISSED") | {id: .id, user: .user.login, state: .state, body: .body}'
```

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --jq '.[] | {id: .id, user: .user.login, path: .path, line: .line, body: .body, in_reply_to_id: .in_reply_to_id, created_at: .created_at}'
```

### 3. Fetch Conversation Threads (for resolved status)

```bash
gh pr view {pr_number} --json reviewThreads --jq '.reviewThreads[] | select(.isResolved == false) | {path: .path, line: .line, comments: [.comments[].body]}'
```

### 4. Filter to Unresolved Only

- Exclude resolved conversation threads
- Exclude bot comments (Vercel, GitHub Actions) unless they contain errors
- Group related replies into single threads

### 5. Generate Summary

For each unresolved thread, output:

```markdown
## Unresolved Comments Summary

### 1. [filename:line] - Brief topic

**Author:** @username
**Comment:** [Condensed version of the feedback]
**Action:** [Specific recommended action]
**Priority:** High/Medium/Low

---
```

### 6. Prioritization Rules

- **High**: Bugs, security issues, logic errors, blocking concerns
- **Medium**: Code quality, refactoring suggestions, missing tests
- **Low**: Style preferences, minor improvements, questions

### 7. Final Output

```markdown
# PR Comments Review: [PR Title]

**PR:** #123 - [URL]
**Unresolved Comments:** X

## Summary by Priority

### High Priority (X)

[List items requiring immediate attention]

### Medium Priority (X)

[List items to address before merge]

### Low Priority (X)

[List optional improvements]

---

## Detailed Comments

[Full details for each comment as shown above]

---

## Quick Actions Checklist

- [ ] Action 1 (file:line)
- [ ] Action 2 (file:line)
- [ ] ...
```

## Rules

- Be concise - summarize long comments to their essence
- Be actionable - every comment should have a clear next step
- Group related comments on the same file/topic
- Preserve code suggestions verbatim if provided
- Note if a comment is a question vs a change request
- If no unresolved comments exist, report "All comments resolved!"
