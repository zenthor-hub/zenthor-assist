import { describe, expect, it } from "vitest";

import { InMemoryConvexDb, makeAuthContext } from "../tests/_test-fakes";
import { runMutation, runQuery } from "../tests/_test-run";
import * as messages from "./messages";

async function createTestUser(db: InMemoryConvexDb, externalId: string) {
  const userId = externalId;
  await db.insert(
    "users",
    {
      externalId,
      name: "Test user",
      email: `${externalId}@example.test`,
      status: "active",
      createdAt: 1,
      updatedAt: 2,
      role: "member",
      phone: undefined,
      emailVerified: true,
      image: undefined,
    },
    userId,
  );
  return userId;
}

describe("messages note-thread linkage", () => {
  it("attaches user messages to notes when conversation-thread matches", async () => {
    const db = new InMemoryConvexDb();
    const userSubject = "note-owner";
    const userId = await createTestUser(db, userSubject);
    const conversationId = await db.insert("conversations", {
      userId,
      channel: "web",
      status: "active",
      title: "Notes",
      createdAt: 1,
      updatedAt: 2,
    });
    const noteId = await db.insert("notes", {
      userId,
      title: "Draft",
      content: "Draft text",
      isArchived: false,
      source: "manual",
      conversationId,
      createdAt: 3,
      updatedAt: 4,
      metadata: undefined,
    });

    const messageId = await runMutation<
      { conversationId: string; content: string; noteId?: string },
      string
    >(
      messages.sendService,
      { db },
      {
        conversationId,
        content: "Update this note please.",
        noteId,
      },
    );

    const message = await db.get(messageId);
    expect(message).toMatchObject({
      conversationId,
      role: "user",
      noteId,
      content: "Update this note please.",
      channel: "web",
      status: "sent",
    });
  });

  it("rejects messages for notes assigned to different note threads", async () => {
    const db = new InMemoryConvexDb();
    const userSubject = "note-owner-2";
    const userId = await createTestUser(db, userSubject);
    const threadOne = await db.insert("conversations", {
      userId,
      channel: "web",
      status: "active",
      title: "Primary",
      createdAt: 1,
      updatedAt: 2,
    });
    const threadTwo = await db.insert("conversations", {
      userId,
      channel: "web",
      status: "active",
      title: "Secondary",
      createdAt: 3,
      updatedAt: 4,
    });
    const foreignNote = await db.insert("notes", {
      userId,
      title: "Foreign",
      content: "Foreign note",
      isArchived: false,
      source: "manual",
      conversationId: threadTwo,
      createdAt: 5,
      updatedAt: 6,
      metadata: undefined,
    });

    await expect(
      runMutation<{ conversationId: string; content: string; noteId?: string }, string>(
        messages.sendService,
        { db },
        {
          conversationId: threadOne,
          content: "Should be rejected",
          noteId: foreignNote,
        },
      ),
    ).rejects.toThrow("Conversation does not match note");
  });

  it("lists messages only for linked note threads", async () => {
    const db = new InMemoryConvexDb();
    const userSubject = "thread-reader";
    const userId = await createTestUser(db, userSubject);
    const conversationId = await db.insert("conversations", {
      userId,
      channel: "web",
      status: "active",
      title: "Notebook",
      createdAt: 1,
      updatedAt: 2,
    });
    const keepNote = await db.insert("notes", {
      userId,
      title: "Keep",
      content: "Keep this",
      isArchived: false,
      source: "manual",
      conversationId,
      createdAt: 3,
      updatedAt: 4,
      metadata: undefined,
    });
    const skipNote = await db.insert("notes", {
      userId,
      title: "Skip",
      content: "Ignore this",
      isArchived: false,
      source: "manual",
      conversationId,
      createdAt: 5,
      updatedAt: 6,
      metadata: undefined,
    });
    const otherConversation = await db.insert("conversations", {
      userId,
      channel: "whatsapp",
      status: "active",
      title: "Other",
      createdAt: 7,
      updatedAt: 8,
      accountId: "wa",
    });
    await db.insert("messages", {
      conversationId,
      noteId: keepNote,
      role: "user",
      content: "Keep A",
      channel: "web",
      status: "sent",
      modelUsed: undefined,
      streaming: false,
      toolCalls: undefined,
    });
    await db.insert("messages", {
      conversationId,
      noteId: keepNote,
      role: "assistant",
      content: "Keep B",
      channel: "web",
      status: "sent",
      modelUsed: undefined,
      streaming: false,
      toolCalls: undefined,
    });
    await db.insert("messages", {
      conversationId,
      noteId: skipNote,
      role: "user",
      content: "Skip C",
      channel: "web",
      status: "sent",
      modelUsed: undefined,
      streaming: false,
      toolCalls: undefined,
    });
    await db.insert("messages", {
      conversationId: otherConversation,
      noteId: keepNote,
      role: "user",
      content: "Wrong thread",
      channel: "whatsapp",
      status: "sent",
      modelUsed: undefined,
      streaming: false,
      toolCalls: undefined,
    });

    const authCtx = makeAuthContext(userSubject, db);
    const keepMessages = await runQuery<
      { noteId: string; limit?: number },
      Array<{
        noteId?: string;
        conversationId: string;
        content: string;
        _id: string;
        _creationTime: number;
      }>
    >(messages.listForNote, authCtx, {
      noteId: keepNote,
      limit: 10,
    });

    expect(keepMessages.map((message: { content: string }) => message.content)).toEqual([
      "Keep A",
      "Keep B",
    ]);
    expect(
      keepMessages.every(
        (message: { conversationId: string; noteId?: string; content: string }) =>
          message.noteId === keepNote,
      ),
    ).toBe(true);
    expect(
      keepMessages.every(
        (message: { conversationId: string; noteId?: string; content: string }) =>
          message.conversationId === conversationId,
      ),
    ).toBe(true);
  });
});
