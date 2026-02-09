# ZTA-63: Add `userId` field to memories table schema

**Priority:** High
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** —
**Blocks:** ZTA-64, ZTA-65

## Summary

Add user ownership to the `memories` table so memories can be queried per-user across all their conversations.

## Changes

**File:** `apps/backend/convex/schema.ts`

1. Add `userId: v.optional(v.id("users"))` to the `memories` table definition
2. Add `"userId"` to the vector index `filterFields`:
   ```
   filterFields: ["source", "conversationId", "userId"]
   ```
3. Add a regular index:
   ```
   .index("by_userId", ["userId"])
   ```

**File:** `apps/backend/convex/memories.ts`

4. Update `memoryDoc` validator to include `userId: v.optional(v.id("users"))`

## Current Code (for reference)

### `schema.ts` — memories table (lines 188-200)

```ts
memories: defineTable({
  conversationId: v.optional(v.id("conversations")),
  content: v.string(),
  embedding: v.array(v.float64()),
  source: v.union(v.literal("conversation"), v.literal("manual")),
  createdAt: v.number(),
})
  .index("by_conversationId", ["conversationId"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["source", "conversationId"],
  }),
```

### `memories.ts` — memoryDoc validator (lines 7-15)

```ts
const memoryDoc = v.object({
  _id: v.id("memories"),
  _creationTime: v.number(),
  conversationId: v.optional(v.id("conversations")),
  content: v.string(),
  embedding: v.array(v.float64()),
  source: v.union(v.literal("conversation"), v.literal("manual")),
  createdAt: v.number(),
});
```

## Notes

- Field is `v.optional()` so existing rows are unaffected (they'll have `userId: undefined`)
- Convex vector indexes support up to 16 filter fields — adding one more is safe
- This is the foundational change that all other cross-chat memory tickets depend on
- Run `bun run typecheck` and `bun run check` after changes
