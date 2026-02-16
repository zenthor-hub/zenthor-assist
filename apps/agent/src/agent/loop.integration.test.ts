import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockAgentGenerateResponse {
  content: string;
  modelUsed: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
}

const mockClient = vi.hoisted(() => ({
  onUpdate: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));

const mockApi = vi.hoisted(() => ({
  agent: {
    getPendingJobs: Symbol("getPendingJobs"),
    getConversationContext: Symbol("getConversationContext"),
    claimJob: Symbol("claimJob"),
    heartbeatJob: Symbol("heartbeatJob"),
    failJob: Symbol("failJob"),
    completeJob: Symbol("completeJob"),
  },
  messages: {
    addSummaryMessage: Symbol("addSummaryMessage"),
    updateMediaTranscript: Symbol("updateMediaTranscript"),
    addAssistantMessage: Symbol("addAssistantMessage"),
    failPlaceholder: Symbol("failPlaceholder"),
  },
  delivery: {
    enqueueOutbound: Symbol("enqueueOutbound"),
  },
}));

vi.mock("@zenthor-assist/backend/convex/_generated/api", () => ({ api: mockApi }));

vi.mock("../convex/client", () => ({
  getConvexClient: vi.fn(() => mockClient),
}));

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    WORKER_ID: "test-worker",
    AGENT_JOB_LOCK_MS: 60_000,
    AGENT_JOB_HEARTBEAT_MS: 15_000,
    WHATSAPP_ACCOUNT_ID: "cloud-api",
    AI_CONTEXT_WINDOW: 128,
  },
}));

vi.mock("./audio-processing", () => ({
  buildConversationMessages: vi.fn((messages) => messages),
  processAudioTrigger: vi.fn(async () => ({
    transcripts: new Map(),
    failed: new Set(),
  })),
}));

vi.mock("./compact", () => ({
  compactMessages: vi.fn(async (messages: unknown[]) => ({
    messages,
    summary: undefined,
  })),
}));

vi.mock("./context-guard", () => ({
  evaluateContext: vi.fn(() => ({ shouldBlock: false })),
}));

vi.mock("./errors", () => ({
  classifyError: vi.fn(() => "mocked"),
  isRetryable: vi.fn(() => false),
}));

const mockGenerateResponse = vi.hoisted(() =>
  vi.fn(
    async (): Promise<MockAgentGenerateResponse> => ({
      content: "hello there",
      toolCalls: [],
      modelUsed: "xai/grok-4.1-fast-reasoning",
    }),
  ),
);

vi.mock("./generate", () => ({
  generateResponse: mockGenerateResponse,
  generateResponseStreaming: vi.fn(),
}));

vi.mock("./media", () => ({
  downloadWhatsAppMedia: vi.fn(),
  uploadMediaToBlob: vi.fn(),
}));

vi.mock("./plugins/loader", () => ({
  discoverAndActivate: vi.fn(() => []),
  resolvePluginTools: vi.fn(async () => ({ tools: {}, policy: undefined })),
  syncBuiltinPluginDefinitions: vi.fn(async () => undefined),
  syncDiagnostics: vi.fn(async () => undefined),
}));

vi.mock("./tool-approval", () => ({
  wrapToolsWithApproval: vi.fn((tools) => tools),
}));

vi.mock("./tool-policy", () => ({
  filterTools: vi.fn((tools) => tools),
  getDefaultPolicy: vi.fn(() => ({})),
  mergeToolPolicies: vi.fn((...policies) =>
    policies.length > 0 ? Object.assign({}, ...policies) : { allow: [], deny: [] },
  ),
}));

vi.mock("./tools", () => ({
  getNoteTools: vi.fn(() => ({})),
}));

vi.mock("./tools/memory", () => ({
  createMemoryTools: vi.fn(() => ({
    memory_search: vi.fn(),
    memory_store: vi.fn(),
  })),
}));

vi.mock("./tools/schedule", () => ({
  createScheduleTask: vi.fn(() => vi.fn()),
}));

vi.mock("./tools/tasks", () => ({
  createTaskTools: vi.fn(() => ({
    task_create: vi.fn(),
    task_list: vi.fn(),
    task_update: vi.fn(),
    task_complete: vi.fn(),
    task_delete: vi.fn(),
  })),
}));

vi.mock("../observability/logger", () => ({
  logger: {
    lineInfo: vi.fn(),
    lineWarn: vi.fn(),
    lineError: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  typedEvent: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

import { logger, typedEvent } from "../observability/logger";
import { startAgentLoop } from "./loop";

const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

beforeEach(() => {
  mockClient.onUpdate.mockClear();
  mockClient.query.mockReset();
  mockClient.mutation.mockReset();
  mockGenerateResponse.mockReset();

  setIntervalSpy.mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);
  setTimeoutSpy.mockImplementation((callback: () => void) => {
    callback();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });

  mockClient.mutation.mockImplementation(async (path, _payload) => {
    if (path === mockApi.messages.addAssistantMessage) return "assistant-msg-1";
    if (path === mockApi.delivery.enqueueOutbound) return "outbound-msg-1";
    if (path === mockApi.agent.claimJob) return true;
    if (path === mockApi.agent.heartbeatJob) return true;
    return undefined;
  });
  mockClient.query.mockImplementation(async (query, _args) => {
    if (query === mockApi.agent.getConversationContext) {
      return {
        conversation: {
          channel: "whatsapp",
          accountId: "cloud-api",
        },
        agent: undefined,
        messages: [{ _id: "m1", role: "user", content: "Hello" }],
        skills: [],
        contact: {
          phone: "+15551111111",
        },
        preferences: {
          showModelInfo: false,
          showToolDetails: false,
        },
      };
    }
    return undefined;
  });
});

afterEach(() => {
  setIntervalSpy.mockRestore();
  setTimeoutSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("startAgentLoop", () => {
  it("processes a WhatsApp job, emits pre-generation diagnostics, and enqueues assistant output", async () => {
    startAgentLoop();

    const onUpdate = mockClient.onUpdate.mock.calls[0]?.[2];
    expect(onUpdate).toBeDefined();
    if (!onUpdate) return;

    await onUpdate([
      {
        _id: "job-1",
        conversationId: "conversation-1",
        messageId: "message-1",
      },
    ]);

    expect(mockGenerateResponse).toHaveBeenCalledOnce();
    expect(mockGenerateResponse).toHaveBeenCalledWith(
      [{ _id: "m1", role: "user", content: "Hello" }],
      [],
      expect.objectContaining({
        channel: "whatsapp",
        conversationId: "conversation-1",
        jobId: "job-1",
        shouldCompact: false,
        shouldBlock: false,
      }),
    );

    expect(mockClient.mutation).toHaveBeenCalledWith(
      mockApi.delivery.enqueueOutbound,
      expect.objectContaining({
        metadata: expect.objectContaining({
          kind: "assistant_message",
        }),
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      "agent.model.pre_generation_diagnostics",
      expect.objectContaining({
        conversationId: "conversation-1",
        jobId: "job-1",
      }),
    );

    expect(mockClient.mutation).toHaveBeenCalledWith(
      mockApi.agent.completeJob,
      expect.objectContaining({
        serviceKey: undefined,
        jobId: "job-1",
      }),
    );
  });

  it("emits a typed summary for note-capable tool usage", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: "",
      toolCalls: [
        {
          name: "note_create",
          input: { title: "Rovaniemi Trip - 5 Days" },
          output:
            '{"action":"note_created","noteId":"nn79frtjskhcmh0dep31jzpz3n8190hn","title":"Rovaniemi Trip - 5 Days"}',
        },
        {
          name: "note_generate_from_conversation",
          input: { title: "Rovaniemi Trip - 5 Days" },
          output: "Could not complete note action: note content is empty.",
        },
      ],
      modelUsed: "xai/grok-4.1-fast-reasoning",
    });

    startAgentLoop();

    const onUpdate = mockClient.onUpdate.mock.calls[0]?.[2];
    expect(onUpdate).toBeDefined();
    if (!onUpdate) return;

    await onUpdate([
      {
        _id: "job-3",
        conversationId: "conversation-3",
        messageId: "message-3",
      },
    ]);

    expect(mockGenerateResponse).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      "agent.loop.started",
      expect.objectContaining({ workerId: "test-worker" }),
    );
    expect(typedEvent.info).toHaveBeenCalledWith(
      "agent.loop.tool_calls",
      expect.objectContaining({
        conversationId: "conversation-3",
        jobId: "job-3",
        channel: "whatsapp",
        generationMode: "non_streaming",
        totalToolCalls: 2,
        uniqueToolCount: 2,
        noteToolCalls: 2,
        noteTools: ["note_create", "note_generate_from_conversation"],
        noteCreationSuccessCount: 1,
        noteCreationFailureCount: 1,
        noteCreationFailures: [
          { toolName: "note_generate_from_conversation", reason: "note content is empty." },
        ],
      }),
    );
  });

  it("enqueues typing indicator before processing WhatsApp messages", async () => {
    startAgentLoop();

    const onUpdate = mockClient.onUpdate.mock.calls[0]?.[2];
    expect(onUpdate).toBeDefined();
    if (!onUpdate) return;

    await onUpdate([
      {
        _id: "job-2",
        conversationId: "conversation-2",
        messageId: "message-2",
      },
    ]);

    const typingCalls = mockClient.mutation.mock.calls.filter((call) => {
      const args = call[0];
      return (
        args === mockApi.delivery.enqueueOutbound && call[1]?.metadata?.kind === "typing_indicator"
      );
    });
    expect(typingCalls.length).toBe(1);
  });
});
