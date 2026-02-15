import { describe, expect, it } from "vitest";

import { InMemoryConvexDb, makeAuthContext } from "../tests/_test-fakes";
import { runMutation, runQuery } from "../tests/_test-run";
import * as notes from "./notes";

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

describe("notes service validation", () => {
  it("creates and reuses a web thread for note edits", async () => {
    const db = new InMemoryConvexDb();
    const userSubject = "user-1";
    const userId = await createTestUser(db, userSubject);
    const noteId = await db.insert("notes", {
      userId,
      folderId: undefined,
      title: "Sprint plan",
      content: "Draft notes",
      isArchived: false,
      isPinned: undefined,
      source: "manual",
      createdAt: 1,
      updatedAt: 2,
      metadata: undefined,
    });

    const authCtx = makeAuthContext(userSubject, db);
    const firstThread = await runMutation<{ id: string }, string>(notes.ensureThread, authCtx, {
      id: noteId,
    });
    const secondThread = await runMutation<{ id: string }, string>(notes.ensureThread, authCtx, {
      id: noteId,
    });

    const conversation = await db.get(firstThread);
    expect(conversation).toMatchObject({
      _id: firstThread,
      userId,
      channel: "web",
      status: "active",
      title: "Sprint plan",
    });

    expect(firstThread).toBe(secondThread);
  });

  it("creates a new web thread if stored thread is not web-owned", async () => {
    const db = new InMemoryConvexDb();
    const userSubject = "user-2";
    const userId = await createTestUser(db, userSubject);
    const oldThread = await db.insert("conversations", {
      userId,
      channel: "whatsapp",
      status: "active",
      title: "old",
      createdAt: 1,
      updatedAt: 2,
      accountId: "wa-account",
    });
    const noteId = await db.insert("notes", {
      userId,
      folderId: undefined,
      title: "Thread mismatch",
      content: "Needs migration",
      isArchived: false,
      source: "manual",
      conversationId: oldThread,
      createdAt: 3,
      updatedAt: 4,
      metadata: undefined,
    });

    const authCtx = makeAuthContext(userSubject, db);
    const replacedThread = await runMutation<{ id: string }, string>(notes.ensureThread, authCtx, {
      id: noteId,
    });
    const noteAfter = await db.get(noteId);

    expect(noteAfter?.conversationId).toBe(replacedThread);
    expect(replacedThread).not.toBe(oldThread);
    expect((await db.get(replacedThread))?.channel).toBe("web");
  });

  it("requires matching user when listing notes for a conversation", async () => {
    const db = new InMemoryConvexDb();
    const userA = "user-a";
    const userB = "user-b";
    const userAId = await createTestUser(db, userA);
    const userBId = await createTestUser(db, userB);

    const conversationA = await db.insert("conversations", {
      userId: userAId,
      channel: "web",
      status: "active",
      title: "User A",
      createdAt: 1,
      updatedAt: 2,
    });
    const conversationB = await db.insert("conversations", {
      userId: userBId,
      channel: "web",
      status: "active",
      title: "User B",
      createdAt: 1,
      updatedAt: 2,
    });
    const noteId = await db.insert("notes", {
      userId: userAId,
      folderId: undefined,
      title: "Private",
      content: "Do not expose",
      isArchived: false,
      source: "manual",
      conversationId: conversationA,
      createdAt: 3,
      updatedAt: 4,
      metadata: undefined,
    });

    const unauthorized = await runQuery<
      { conversationId: string; id: string },
      { _id: string; _creationTime: number } | null
    >(
      notes.getForConversation,
      { db },
      {
        conversationId: conversationB,
        id: noteId,
      },
    );

    expect(unauthorized).toBeNull();
  });

  it("blocks service writes to folders owned by another user", async () => {
    const db = new InMemoryConvexDb();
    const ownerId = "owner";
    const otherId = "other";
    const ownerUserId = await createTestUser(db, ownerId);
    const otherUserId = await createTestUser(db, otherId);
    const conversationId = await db.insert("conversations", {
      userId: ownerUserId,
      channel: "web",
      status: "active",
      title: "Chat",
      createdAt: 1,
      updatedAt: 2,
    });
    const otherFolder = await db.insert("noteFolders", {
      userId: otherUserId,
      name: "Other folder",
      color: "#ff0000",
      position: 0,
      createdAt: 1,
      updatedAt: 2,
    });

    await expect(
      runMutation<
        { conversationId: string; title: string; content: string; folderId?: string },
        string
      >(
        notes.createForConversation,
        { db },
        {
          conversationId,
          title: "Injected note",
          content: "Bad folder",
          folderId: otherFolder,
        },
      ),
    ).rejects.toThrow("Folder not found");
  });

  it("requires matched conversation when updating note content via service path", async () => {
    const db = new InMemoryConvexDb();
    const userId = "user-service";
    const userInternalId = await createTestUser(db, userId);
    const conversationOne = await db.insert("conversations", {
      userId: userInternalId,
      channel: "web",
      status: "active",
      title: "One",
      createdAt: 1,
      updatedAt: 2,
    });
    const conversationTwo = await db.insert("conversations", {
      userId: userInternalId,
      channel: "web",
      status: "active",
      title: "Two",
      createdAt: 3,
      updatedAt: 4,
    });
    const noteId = await db.insert("notes", {
      userId: userInternalId,
      folderId: undefined,
      title: "Scoped",
      content: "Needs edit",
      isArchived: false,
      source: "manual",
      conversationId: conversationOne,
      createdAt: 5,
      updatedAt: 6,
      metadata: undefined,
    });

    await expect(
      runMutation<
        {
          conversationId: string;
          id: string;
          content: string;
          title?: string;
          folderId?: string;
          isArchived?: boolean;
          isPinned?: boolean;
          source?: "manual" | "chat-generated" | "imported";
          metadata?: unknown;
        },
        null
      >(
        notes.updateForConversation,
        { db },
        {
          conversationId: conversationTwo,
          id: noteId,
          content: "Attempted edit",
        },
      ),
    ).rejects.toThrow("Conversation does not match note");
  });

  it("creates chat-generated notes from conversation context", async () => {
    const db = new InMemoryConvexDb();
    const userId = "creator";
    const userInternalId = await createTestUser(db, userId);
    const conversationId = await db.insert("conversations", {
      userId: userInternalId,
      channel: "web",
      status: "active",
      title: "Chat workspace",
      createdAt: 1,
      updatedAt: 2,
    });

    const noteId = await runMutation<
      {
        conversationId: string;
        title: string;
        content: string;
        folderId?: string;
        source?: string;
      },
      string
    >(
      notes.createForConversation,
      { db },
      {
        conversationId,
        title: "Generated note",
        content: "Generated",
        source: "chat-generated",
      },
    );

    const note = await db.get(noteId);
    expect(note).toMatchObject({
      _id: noteId,
      userId: userInternalId,
      conversationId,
      source: "chat-generated",
    });
    expect(note?.metadata).toEqual({ createdFrom: "conversation" });
  });
});
