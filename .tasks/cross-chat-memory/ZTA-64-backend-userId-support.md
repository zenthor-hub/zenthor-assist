# ZTA-64: Update memories backend actions to support userId

**Priority:** High
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** ZTA-63
**Blocks:** ZTA-65, ZTA-66

## Summary

Update the Convex memory actions (`store`, `search`, `insertMemory`) and add a `listByUser` query so memories can be stored and searched per-user.

## Changes

**File:** `apps/backend/convex/memories.ts`

### `insertMemory` mutation
- Add `userId: v.optional(v.id("users"))` to args
- Persist `userId` into the inserted doc

### `store` action
- Add `userId: v.optional(v.id("users"))` to args
- Pass `userId` through to `insertMemory`

### `search` action
- Add `userId: v.optional(v.id("users"))` to args
- When `userId` is provided (and `conversationId` is not), filter vector search by `userId`:
  ```ts
  filter: (q) => q.eq("userId", args.userId)
  ```
- When both are provided, prefer `userId` (cross-chat is the default, conversation-scoped is opt-in)

### New: `listByUser` service query
- Args: `userId: v.id("users")`
- Query memories using `by_userId` index
- Return same shape as `listByConversation`

## Current Code (for reference)

### `insertMemory` (lines 28-45)
```ts
export const insertMemory = internalMutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("conversation"), v.literal("manual")),
  },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("memories", {
      conversationId: args.conversationId,
      content: args.content,
      embedding: args.embedding,
      source: args.source,
      createdAt: Date.now(),
    });
  },
});
```

### `store` action (lines 56-71)
```ts
export const store = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("conversation"), v.literal("manual")),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(internal.memories.insertMemory, {
      conversationId: args.conversationId,
      content: args.content,
      embedding: args.embedding,
      source: args.source,
    });
  },
});
```

### `search` action (lines 73-102)
```ts
export const search = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<Array<{ id: string; content: string; source: string; score: number }>> => {
    const results = await ctx.vectorSearch("memories", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 5,
      ...(args.conversationId !== undefined && {
        filter: (q) => q.eq("conversationId", args.conversationId),
      }),
    });
    const docs = await ctx.runQuery(internal.memories.fetchResults, {
      ids: results.map((r) => r._id),
    });
    return docs.map((doc, i) => ({
      id: doc._id,
      content: doc.content,
      source: doc.source,
      score: results[i]?._score ?? 0,
    }));
  },
});
```

## Acceptance Criteria

- `store` accepts and persists `userId`
- `search` can filter by `userId` to return cross-chat results
- `listByUser` returns all memories for a given user
- Existing calls without `userId` still work (backward compatible)
- `bun run typecheck` passes
