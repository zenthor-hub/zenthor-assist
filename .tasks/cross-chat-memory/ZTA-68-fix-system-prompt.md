# ZTA-68: Fix system prompt memory tool description

**Priority:** Low
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** ZTA-67
**Blocks:** —

## Summary

Update the `BASE_SYSTEM_PROMPT` in `generate.ts` to accurately describe the cross-chat memory capability (currently says "across conversations" but that wasn't true until now).

## Changes

**File:** `apps/agent/src/agent/generate.ts`

Line 18, change from:
```
- Use `memory_search` and `memory_store` to recall and save important facts across conversations.
```
To:
```
- Use `memory_search` to recall facts, preferences, and context from any past conversation. Use `memory_store` to save important information that should persist across all future chats.
```

## Current Code (for reference)

### `generate.ts` — BASE_SYSTEM_PROMPT (lines 12-21)
```ts
const BASE_SYSTEM_PROMPT = `You are a helpful personal AI assistant for Guilherme (gbarros). You can assist with questions, tasks, and general conversation. Be concise but friendly. When you don't know something, say so. Use tools when appropriate.

## Tool usage guidance
- Use \`calculate\` for precise math instead of doing mental arithmetic.
- Use \`date_calc\` for date arithmetic, differences between dates, or getting day-of-week/week-number info.
- Use \`browse_url\` to read web pages, articles, or documentation when the user shares a URL or you need to look up page content.
- Use \`memory_search\` and \`memory_store\` to recall and save important facts across conversations.
- Use \`schedule_task\` to set up recurring reminders or tasks.
- Use Todoist tools (\`todoist_capture_task\`, \`todoist_list_tasks\`, \`todoist_complete_task\`, \`todoist_reschedule_task\`) for actionable personal planning when the user has connected Todoist.
- Use \`get_current_time\` when you need the current date or time.`;
```

## Notes

- This is a low-priority cleanup that should land alongside or after the actual cross-chat memory implementation
- The updated wording should match what the tools actually do post-implementation
