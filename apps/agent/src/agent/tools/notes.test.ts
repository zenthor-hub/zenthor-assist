import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { createNoteTools } from "./notes";

type NoteRecord = {
  _id: string;
  title: string;
  content: string;
  isArchived: boolean;
};

type SetupResult = {
  tools: ReturnType<typeof createNoteTools>;
  mockQuery: ReturnType<typeof vi.fn>;
  mockMutation: ReturnType<typeof vi.fn>;
  mockLoggerWarn: ReturnType<typeof vi.fn>;
};

const conversationId = "conv-note-1" as Parameters<typeof createNoteTools>[0];
const validNoteIdOne = "a".repeat(32);
const validNoteIdTwo = "b".repeat(32);
const validNoteIdThree = "c".repeat(32);
const validNoteIdFour = "d".repeat(32);
const validNoteIdFive = "e".repeat(32);

function makeToolResultMock(overrides?: { serviceSecret?: string }) {
  const mockQuery = vi.fn();
  const mockMutation = vi.fn();
  const mockLoggerWarn = vi.fn();

  vi.doMock("@zenthor-assist/env/agent", () => ({
    env: {
      AGENT_SECRET: overrides?.serviceSecret ?? "agent-secret",
    },
  }));
  vi.doMock("../../observability/logger", () => ({
    logger: {
      warn: mockLoggerWarn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      lineInfo: vi.fn(),
      lineWarn: vi.fn(),
      lineError: vi.fn(),
      exception: vi.fn(),
      flush: vi.fn(),
    },
  }));
  vi.doMock("../../convex/client", () => ({
    getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
  }));

  return { mockQuery, mockMutation, mockLoggerWarn };
}

async function setupTools(overrides?: { serviceSecret?: string }): Promise<SetupResult> {
  const { mockQuery, mockMutation, mockLoggerWarn } = makeToolResultMock(overrides);
  const { createNoteTools } = await import("./notes");

  return {
    tools: createNoteTools(conversationId),
    mockQuery,
    mockMutation,
    mockLoggerWarn,
  };
}

function toolExecute(tool: unknown, input: object) {
  const castTool = tool as { execute?: (input: object, options: object) => Promise<string> };
  if (!castTool.execute) {
    throw new Error("Expected tool execute function to be defined.");
  }
  return castTool.execute(input, {});
}

function parseTransformOutput(result: string) {
  return JSON.parse(result) as {
    noteId: string;
    intent: string;
    resultText: string;
    operations: string;
  };
}

describe("createNoteTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("formats note transform output with intent-derived operations", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockResolvedValue({
      _id: validNoteIdOne,
      title: "Focus notes",
      content: "First point\nSecond point",
      isArchived: false,
    } satisfies NoteRecord);

    const result = (await toolExecute(tools.note_transform, {
      noteId: validNoteIdOne,
      intent: "summarize",
    })) as string;

    expect(mockQuery).toHaveBeenCalledWith(api.notes.getForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: validNoteIdOne,
    });

    const parsed = parseTransformOutput(result);
    expect(parsed.noteId).toBe(validNoteIdOne);
    expect(parsed.intent).toBe("summarize");
    expect(parsed.resultText).toContain("Summary:");
    expect(parsed.operations).toBe("summarize-content-blocks");
  });

  it("rejects empty note_update content after conversion", async () => {
    const { tools, mockMutation } = await setupTools();
    mockMutation.mockResolvedValue(undefined);

    const result = (await toolExecute(tools.note_update, {
      noteId: validNoteIdOne,
      content: "   ",
    })) as string;

    expect(result).toBe("Could not complete note action: note content is empty.");
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("blocks malformed note IDs before querying Convex", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockResolvedValue({
      _id: validNoteIdOne,
      title: "Focus notes",
      content: "First point\nSecond point",
      isArchived: false,
    } satisfies NoteRecord);

    const result = (await toolExecute(tools.note_transform, {
      noteId: "malformed-note-id",
      intent: "summarize",
    })) as string;

    expect(result).toBe(
      "Could not complete note action: The provided note ID is not valid. Use the exact note ID returned by note_list or note_get.",
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns not found for missing note transforms", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockResolvedValue(null);

    const result = (await toolExecute(tools.note_transform, {
      noteId: validNoteIdTwo,
      intent: "rewrite",
    })) as string;

    expect(result).toBe("Note not found.");
    expect(mockQuery).toHaveBeenCalledWith(api.notes.getForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: validNoteIdTwo,
    });
  });

  it("persists transform output through note_apply_transform", async () => {
    const { tools, mockMutation } = await setupTools();
    mockMutation.mockResolvedValue(undefined);

    const result = (await toolExecute(tools.note_apply_transform, {
      noteId: validNoteIdThree,
      resultText: "# Updated content",
      operations: "rewrite:tone",
    })) as string;

    expect(result).toBe(`Applied transform for ${validNoteIdThree}.`);
    const [, mutationArgs] = mockMutation.mock.calls[0] ?? [];
    expect(mutationArgs).toMatchObject({
      serviceKey: "agent-secret",
      conversationId,
      id: validNoteIdThree,
      content: "<h1>Updated content</h1>",
      operations: "rewrite:tone",
      model: "agent-notes-tools",
    });
  });

  it("aliases note_apply_transform behavior in note_update_from_ai", async () => {
    const { tools, mockMutation } = await setupTools();
    mockMutation.mockResolvedValue(undefined);

    const result = (await toolExecute(tools.note_update_from_ai, {
      noteId: validNoteIdFour,
      resultText: "## AI rewritten text",
      operations: "apply-override",
    })) as string;

    expect(result).toBe(`Applied AI update for ${validNoteIdFour}.`);
    const [, mutationArgs] = mockMutation.mock.calls[0] ?? [];
    expect(mutationArgs).toMatchObject({
      serviceKey: "agent-secret",
      conversationId,
      id: validNoteIdFour,
      content: "<h2>AI rewritten text</h2>",
      operations: "apply-override",
      model: "agent-notes-tools",
    });
  });

  it("creates a chat-generated note from the conversation history", async () => {
    const { tools, mockQuery, mockMutation } = await setupTools();
    mockQuery.mockResolvedValue([
      { role: "user", content: "Write a roadmap" },
      { role: "assistant", content: "Draft: Q1, Q2, Q3" },
    ]);
    mockMutation.mockResolvedValue(validNoteIdOne);

    const result = (await toolExecute(tools.note_generate_from_conversation, {
      title: "Roadmap notes",
      messageLimit: 60,
    })) as string;

    expect(mockQuery).toHaveBeenCalledWith(api.messages.listByConversationWindowForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      limit: 60,
    });
    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.createForConversation,
      expect.objectContaining({
        serviceKey: "agent-secret",
        conversationId,
        title: "Roadmap notes",
        source: "chat-generated",
        folderId: undefined,
        content:
          "<h2>Source conversation</h2><ul><li>user: Write a roadmap</li><li>assistant: Draft: Q1, Q2, Q3</li></ul>",
      }),
    );
    const parsed = JSON.parse(result) as {
      action: string;
      noteId: string;
      title: string;
      source: string;
    };
    expect(parsed.action).toBe("note_created");
    expect(parsed.noteId).toBe(validNoteIdOne);
    expect(parsed.title).toBe("Roadmap notes");
    expect(parsed.source).toBe("chat-generated");
  });

  it("sanitizes invalid folder IDs for note operations", async () => {
    const { tools, mockQuery, mockMutation, mockLoggerWarn } = await setupTools();
    mockQuery.mockResolvedValue([]);
    mockMutation.mockResolvedValue(validNoteIdFive);

    const listResult = (await toolExecute(tools.note_list, {
      limit: 10,
      folderId: "trips",
    })) as string;
    expect(mockQuery).toHaveBeenCalledWith(api.notes.listForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      folderId: undefined,
      isArchived: undefined,
      limit: 10,
    });
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(listResult).toContain("was not recognized");

    const created = (await toolExecute(tools.note_create, {
      title: "Draft",
      content: "Notes",
      folderId: "trips",
    })) as string;

    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.createForConversation,
      expect.objectContaining({
        serviceKey: "agent-secret",
        conversationId,
        folderId: undefined,
      }),
    );
    expect(created).toContain("noteId");
    expect(created).toContain("was not recognized");
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);

    const generateWithUuid = (await toolExecute(tools.note_generate_from_conversation, {
      title: "Generated",
      folderId: "trips",
      messageLimit: 10,
    })) as string;
    expect(mockLoggerWarn).toHaveBeenCalledTimes(3);
    expect(mockLoggerWarn).toHaveBeenLastCalledWith(
      "agent.notes.tool.folder_id_sanitized",
      expect.objectContaining({
        toolName: "note_generate_from_conversation",
        reason: "invalid-format",
      }),
    );

    expect(mockQuery).toHaveBeenCalledWith(api.messages.listByConversationWindowForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      limit: 10,
    });
    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.createForConversation,
      expect.objectContaining({
        serviceKey: "agent-secret",
        conversationId,
        folderId: undefined,
      }),
    );
    expect(generateWithUuid).toContain("note_created");
    expect(generateWithUuid).toContain("was not recognized");

    const generateWithEmpty = (await toolExecute(tools.note_generate_from_conversation, {
      title: "Generated",
      folderId: "   ",
      messageLimit: 10,
    })) as string;
    expect(mockLoggerWarn).toHaveBeenCalledTimes(4);
    expect(mockLoggerWarn).toHaveBeenLastCalledWith(
      "agent.notes.tool.folder_id_sanitized",
      expect.objectContaining({
        toolName: "note_generate_from_conversation",
        reason: "empty",
      }),
    );
    expect(generateWithEmpty).toContain("note_created");
    expect(generateWithEmpty).toContain("was empty");

    const moveResult = (await toolExecute(tools.note_move, {
      noteId: validNoteIdFive,
      folderId: "abcde",
    })) as string;
    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.moveToFolderForConversation,
      expect.objectContaining({
        serviceKey: "agent-secret",
        conversationId,
        id: validNoteIdFive,
        folderId: undefined,
      }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledTimes(5);
    expect(moveResult).toContain("was not recognized");

    const updateResult = (await toolExecute(tools.note_update, {
      noteId: validNoteIdFive,
      folderId: "00000000-0000-0000-0000-000000000000",
    })) as string;
    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.updateForConversation,
      expect.objectContaining({
        serviceKey: "agent-secret",
        conversationId,
        id: validNoteIdFive,
        folderId: undefined,
      }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledTimes(6);
    expect(updateResult).toContain("was not recognized");
  });

  it("passes through a valid folderId when it matches Convex ID shape", async () => {
    const { tools, mockMutation, mockQuery } = await setupTools();
    mockQuery.mockResolvedValue([]);
    mockMutation.mockResolvedValue("note-valid-folder");

    const validFolderId = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

    await toolExecute(tools.note_create, {
      title: "With folder",
      content: "Notes",
      folderId: validFolderId,
    });

    expect(mockMutation).toHaveBeenCalledWith(
      api.notes.createForConversation,
      expect.objectContaining({
        folderId: validFolderId,
      }),
    );
  });

  it("returns service errors from tool execution", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockRejectedValue(new Error("transcript service unavailable"));

    const result = (await toolExecute(tools.note_transform, {
      noteId: validNoteIdFive,
      intent: "expand",
    })) as string;

    expect(result).toBe("Could not complete note action: transcript service unavailable");
  });
});
