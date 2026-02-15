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
};

const conversationId = "conv-note-1" as Parameters<typeof createNoteTools>[0];

function makeToolResultMock(overrides?: { serviceSecret?: string }) {
  const mockQuery = vi.fn();
  const mockMutation = vi.fn();

  vi.doMock("@zenthor-assist/env/agent", () => ({
    env: {
      AGENT_SECRET: overrides?.serviceSecret ?? "agent-secret",
    },
  }));
  vi.doMock("../../convex/client", () => ({
    getConvexClient: () => ({ query: mockQuery, mutation: mockMutation }),
  }));

  return { mockQuery, mockMutation };
}

async function setupTools(overrides?: { serviceSecret?: string }): Promise<SetupResult> {
  const { mockQuery, mockMutation } = makeToolResultMock(overrides);
  const { createNoteTools } = await import("./notes");

  return {
    tools: createNoteTools(conversationId),
    mockQuery,
    mockMutation,
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
      _id: "note-transform-1",
      title: "Focus notes",
      content: "First point\nSecond point",
      isArchived: false,
    } satisfies NoteRecord);

    const result = (await toolExecute(tools.note_transform, {
      noteId: "note-transform-1",
      intent: "summarize",
    })) as string;

    expect(mockQuery).toHaveBeenCalledWith(api.notes.getForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: "note-transform-1",
    });

    const parsed = parseTransformOutput(result);
    expect(parsed.noteId).toBe("note-transform-1");
    expect(parsed.intent).toBe("summarize");
    expect(parsed.resultText).toContain("Summary:");
    expect(parsed.operations).toBe("summarize-content-blocks");
  });

  it("returns not found for missing note transforms", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockResolvedValue(null);

    const result = (await toolExecute(tools.note_transform, {
      noteId: "note-transform-missing",
      intent: "rewrite",
    })) as string;

    expect(result).toBe("Note not found.");
    expect(mockQuery).toHaveBeenCalledWith(api.notes.getForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: "note-transform-missing",
    });
  });

  it("persists transform output through note_apply_transform", async () => {
    const { tools, mockMutation } = await setupTools();
    mockMutation.mockResolvedValue(undefined);

    const result = (await toolExecute(tools.note_apply_transform, {
      noteId: "note-transform-save",
      resultText: "# Updated content",
      operations: "rewrite:tone",
    })) as string;

    expect(result).toBe("Applied transform for note-transform-save.");
    expect(mockMutation).toHaveBeenCalledWith(api.notes.applyAiPatchForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: "note-transform-save",
      content: "# Updated content",
      operations: "rewrite:tone",
      model: "agent-notes-tools",
    });
  });

  it("aliases note_apply_transform behavior in note_update_from_ai", async () => {
    const { tools, mockMutation } = await setupTools();
    mockMutation.mockResolvedValue(undefined);

    const result = (await toolExecute(tools.note_update_from_ai, {
      noteId: "note-update-ai",
      resultText: "## AI rewritten text",
      operations: "apply-override",
    })) as string;

    expect(result).toBe("Applied AI update for note-update-ai.");
    expect(mockMutation).toHaveBeenCalledWith(api.notes.applyAiPatchForConversation, {
      serviceKey: "agent-secret",
      conversationId,
      id: "note-update-ai",
      content: "## AI rewritten text",
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
    mockMutation.mockResolvedValue("note-generated-1");

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
        content: "## Source conversation\n- user: Write a roadmap\n- assistant: Draft: Q1, Q2, Q3",
      }),
    );
    const parsed = JSON.parse(result) as {
      action: string;
      noteId: string;
      title: string;
      source: string;
    };
    expect(parsed.action).toBe("note_created");
    expect(parsed.noteId).toBe("note-generated-1");
    expect(parsed.title).toBe("Roadmap notes");
    expect(parsed.source).toBe("chat-generated");
  });

  it("returns service errors from tool execution", async () => {
    const { tools, mockQuery } = await setupTools();
    mockQuery.mockRejectedValue(new Error("transcript service unavailable"));

    const result = (await toolExecute(tools.note_transform, {
      noteId: "note-failing",
      intent: "expand",
    })) as string;

    expect(result).toBe("Could not complete note action: transcript service unavailable");
  });
});
