# ZTA-65: Backfill `userId` on existing memory records

**Priority:** Medium
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** ZTA-63, ZTA-64
**Blocks:** —

## Summary

One-time migration to populate `userId` on existing `memories` rows by resolving each memory's `conversationId` to the conversation's owner.

## Approach

Create an internal migration action in `apps/backend/convex/memories.ts`:

```ts
export const backfillUserId = internalAction({
  handler: async (ctx) => {
    // 1. Query all memories where userId is undefined
    // 2. For each, resolve conversationId -> conversation.userId
    // 3. Batch-patch the userId field
  },
});
```

### Resolution logic

- If memory has `conversationId`: look up conversation -> use `conversation.userId` or fallback to `contact.userId` via the contact record
- If memory has no `conversationId`: leave `userId` as `undefined`

## Context: How userId is resolved elsewhere

In `apps/backend/convex/agent.ts` (line 369), the pattern is:

```ts
const ownerUserId = conversation.userId ?? contact?.userId;
```

The backfill should follow the same resolution:

1. Get the conversation from `conversationId`
2. If `conversation.userId` exists, use it
3. If not, check `conversation.contactId` -> look up contact -> use `contact.userId`

## Notes

- Run this once after the schema change (ZTA-63) and backend updates (ZTA-64) are deployed
- Can be triggered via Convex dashboard or a one-off script
- Should be idempotent (skip memories that already have `userId` set)
- Log count of updated/skipped records
- This can run in parallel with ZTA-66 (agent tool changes) since they don't depend on each other
