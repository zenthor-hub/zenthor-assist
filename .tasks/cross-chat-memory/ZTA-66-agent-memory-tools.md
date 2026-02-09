# ZTA-66: Update agent memory tools to search by userId (cross-chat)

**Priority:** High
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** ZTA-64
**Blocks:** ZTA-67

## Summary

Update the agent-side memory tools to use `userId` for search (cross-chat recall) and store both `userId` + `conversationId` when saving.

## Changes

**File:** `apps/agent/src/agent/tools/memory.ts`

### `createMemoryTools` signature
Change from:
```ts
export function createMemoryTools(conversationId: Id<"conversations">)
```
To:
```ts
export function createMemoryTools(opts: {
  conversationId: Id<"conversations">;
  userId?: Id<"users">;
})
```

### `memory_search` tool
- When `userId` is provided: search by `userId` (cross-chat — user's full memory)
- When `userId` is not provided: fall back to `conversationId` (existing behavior)
- Update description to: "Search your long-term memory for relevant information from any past conversation"

### `memory_store` tool
- Always pass both `conversationId` (origin tracking) and `userId` (ownership) to the backend
- Update description to: "Store an important fact or preference in long-term memory — accessible in all future conversations"

### Static tool instances
- Update descriptions on the static `memorySearch` and `memoryStore` exports to match

## Current Code (for reference)

### `createMemoryTools` (lines 28-63)
```ts
export function createMemoryTools(conversationId: Id<"conversations">) {
  const search = tool({
    description: memorySearchDescription,
    inputSchema: memorySearchInputSchema,
    execute: async ({ query, limit }) => {
      const embedding = await generateEmbedding(query);
      const client = getConvexClient();
      const results = (await client.action(api.memories.search, {
        embedding,
        limit: limit ?? 5,
        conversationId,
      })) as MemoryResult[];
      if (!results || results.length === 0) return "No relevant memories found.";
      return results.map((r) => r.content).join("\n\n---\n\n");
    },
  });

  const store = tool({
    description: memoryStoreDescription,
    inputSchema: memoryStoreInputSchema,
    execute: async ({ content }) => {
      const embedding = await generateEmbedding(content);
      const client = getConvexClient();
      await client.action(api.memories.store, {
        content,
        embedding,
        source: "manual",
        conversationId,
      });
      return `Stored in memory: "${content.substring(0, 100)}..."`;
    },
  });

  return { memory_search: search, memory_store: store };
}
```

## Acceptance Criteria

- `memory_search` returns results from any conversation belonging to the user
- `memory_store` persists both `userId` and `conversationId`
- Falls back gracefully when `userId` is undefined (e.g., orphan conversations)
- `bun run typecheck` passes
