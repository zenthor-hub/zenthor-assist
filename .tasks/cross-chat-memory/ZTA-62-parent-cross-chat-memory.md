# ZTA-62: Cross-Chat Memory: Enable user-scoped memory across conversations

**Priority:** High
**Status:** Backlog
**Type:** Parent/Epic
**Labels:** Feature

## Overview

Currently, each conversation is a fully isolated silo. The memory system (Phase 7) exists but is deliberately scoped to individual conversations — the agent cannot recall information from previous chats when a user starts a new one.

**Goal:** Enable the agent to recall and reference relevant information from a user's past conversations, so that knowledge persists across chat sessions.

## Current State

- `memories` table exists with vector search (`by_embedding` index, 1536 dimensions)
- Memory tools (`memory_search`, `memory_store`) are conversation-scoped — `loop.ts:231-237` overrides static tools with `createMemoryTools(job.conversationId)`
- `memories.search` action already skips the `conversationId` filter when it's `undefined`
- `getConversationContext` already resolves `ownerUserId` (`conversation.userId ?? contact?.userId`) but doesn't use it for memory
- The `BASE_SYSTEM_PROMPT` in `generate.ts:18` misleadingly says "across conversations" — but tools don't actually support this

## Key Architectural Decision

**Missing field:** The `memories` table has no `userId` — so there's no way to search "all memories for this user" without also leaking memories from other users. Adding `userId` to the schema + vector index filter fields is the foundational change.

## Implementation Plan

### 1. Schema migration — Add `userId` to memories
- Add `userId: v.optional(v.id("users"))` to the `memories` table
- Add `"userId"` to the vector index `filterFields`: `["source", "conversationId", "userId"]`
- Add a regular index `by_userId` for non-vector queries

### 2. Backend — User-scoped search/store actions
- Update `memories.store` and `insertMemory` to accept and persist `userId`
- Update `memories.search` to support filtering by `userId` (in addition to existing `conversationId` filter)
- Add `listByUser` service query

### 3. Backfill — Populate `userId` on existing memories
- One-time migration: resolve each memory's `conversationId → conversation.userId` and set `userId`
- Memories without a `conversationId` remain with `userId: undefined`

### 4. Agent tools — User-scoped memory tools
- Update `createMemoryTools` to accept `userId` alongside `conversationId`
- `memory_store`: save with both `conversationId` (origin) and `userId` (ownership)
- `memory_search`: search by `userId` (cross-chat) instead of `conversationId`
- Update tool descriptions to reflect cross-chat capability

### 5. Agent loop — Wire userId into memory tools
- In `loop.ts`, resolve `userId` from conversation context (already available as `ownerUserId` pattern in `getConversationContext`)
- Pass `userId` to `createMemoryTools()` instead of just `conversationId`

### 6. Fix system prompt
- Update `generate.ts:18` to accurately describe the cross-chat memory capability

## Technical Notes

- Convex vector indexes support up to 16 filter fields — adding `userId` is safe
- The `ownerUserId` resolution pattern (`conversation.userId ?? contact?.userId`) already exists in `getConversationContext` — we need it available in `loop.ts` as well
- Existing conversation-scoped memories will still work after backfill since they'll have both `conversationId` and `userId`
- No UI changes required in this phase — the memory tools are agent-internal

## Child Tickets

| Order | Ticket | Title | Blocked by |
|---|---|---|---|
| 1 | ZTA-63 | Add `userId` field to memories table schema | — |
| 2 | ZTA-64 | Update memories backend actions to support userId | ZTA-63 |
| 3 | ZTA-65 | Backfill `userId` on existing memory records | ZTA-63, ZTA-64 |
| 4 | ZTA-66 | Update agent memory tools to search by userId | ZTA-64 |
| 5 | ZTA-67 | Wire userId into memory tools in agent loop | ZTA-66 |
| 6 | ZTA-68 | Fix system prompt memory tool description | ZTA-67 |

Note: ZTA-65 (backfill) and ZTA-66 (agent tools) can run in parallel.
