# ZTA-67: Wire userId into memory tools in agent loop

**Priority:** High
**Status:** Backlog
**Parent:** ZTA-62
**Blocked by:** ZTA-66
**Blocks:** ZTA-68

## Summary

Pass `userId` from the conversation context into the memory tools in `loop.ts`, completing the cross-chat memory wiring.

## Changes

### File: `apps/agent/src/agent/loop.ts`

#### Resolve userId from context
After getting `context` (line ~138), resolve the owner userId:
```ts
const ownerUserId = context.user?._id ?? undefined;
```

Note: For WhatsApp (contact-based) conversations, we need the contact's linked `userId`. The `getConversationContext` query already resolves `ownerUserId` internally for skills, but doesn't expose it directly. Two options:
1. **Option A (preferred):** Expose `ownerUserId` in the `getConversationContext` return value
2. **Option B:** Resolve it in loop.ts: `context.conversation.userId ?? context.contact?.userId` — but `contact` doesn't currently expose `userId` in the return type

#### Update memory tool binding (line ~232)
Change from:
```ts
const scopedMemory = createMemoryTools(job.conversationId);
```
To:
```ts
const scopedMemory = createMemoryTools({
  conversationId: job.conversationId,
  userId: ownerUserId,
});
```

#### Update comment (line ~231)
Change from:
```
// Bind memory tools to this conversation to prevent cross-conversation data leaks
```
To:
```
// Bind memory tools to this user for cross-chat recall (scoped by userId for isolation)
```

### File: `apps/backend/convex/agent.ts` (if Option A)

In `getConversationContext`, add `ownerUserId` to the return object — it's already computed at line 369 but not exposed.

## Current Code (for reference)

### `loop.ts` — context fetch and memory binding (lines 138-237)
```ts
const context = await client.query(api.agent.getConversationContext, {
  serviceKey,
  conversationId: job.conversationId,
});
// ... (lines 139-230 omitted)

// Bind memory tools to this conversation to prevent cross-conversation data leaks
const scopedMemory = createMemoryTools(job.conversationId);
if (pluginTools.tools.memory_search) {
  pluginTools.tools.memory_search = scopedMemory.memory_search;
}
if (pluginTools.tools.memory_store) {
  pluginTools.tools.memory_store = scopedMemory.memory_store;
}
```

### `agent.ts` — getConversationContext (lines 363-404)
```ts
const user = conversation.userId ? await ctx.db.get(conversation.userId) : null;
const contact = conversation.contactId ? await ctx.db.get(conversation.contactId) : null;
const ownerUserId = conversation.userId ?? contact?.userId;
// ... ownerUserId used for skills query but NOT exposed in return value
return { conversation, user, contact, messages, skills, agent, preferences };
```

## Acceptance Criteria

- Memory tools in the agent loop receive the user's ID
- Cross-chat search works for web conversations (userId is set)
- Cross-chat search works for WhatsApp conversations (userId resolved via contact)
- Graceful fallback when userId is not available
- `bun run typecheck` passes
