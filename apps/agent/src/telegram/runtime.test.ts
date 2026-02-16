import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockMutation = vi.fn();

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    AGENT_SECRET: "test-secret",
    WORKER_ID: "telegram-worker",
    TELEGRAM_ACCOUNT_ID: "telegram-default",
  },
}));

vi.mock("../convex/client", () => ({
  getConvexClient: () => ({ mutation: mockMutation }),
}));

vi.mock("./sender", () => ({
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  sendTypingIndicator: vi.fn(),
}));

vi.mock("../observability/logger", () => ({
  logger: {
    lineInfo: vi.fn(),
    lineWarn: vi.fn(),
    lineError: vi.fn(),
  },
  typedEvent: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

vi.mock("@zenthor-assist/backend/convex/_generated/api", () => ({
  api: {
    delivery: {
      claimNextOutbound: "delivery:claimNextOutbound",
      completeOutbound: "delivery:completeOutbound",
      failOutbound: "delivery:failOutbound",
    },
  },
}));

import { startTelegramRuntime } from "./runtime";
import { deleteMessage, editMessage, sendMessage, sendTypingIndicator } from "./sender";

const mockedSend = vi.mocked(sendMessage);
const mockedEdit = vi.mocked(editMessage);
const mockedDelete = vi.mocked(deleteMessage);
const mockedTyping = vi.mocked(sendTypingIndicator);

function hang<T = unknown>(): Promise<T> {
  return new Promise<T>(() => {});
}

function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function setupDefaultMock() {
  mockMutation.mockImplementation(async (fn: string) => {
    if (fn === "delivery:claimNextOutbound") return hang();
    return undefined;
  });
}

beforeEach(() => {
  mockMutation.mockReset();
  mockedSend.mockReset();
  mockedEdit.mockReset();
  mockedDelete.mockReset();
  mockedTyping.mockReset();
  setupDefaultMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startTelegramRuntime", () => {
  it("starts outbound loop and claims telegram jobs", async () => {
    const p = startTelegramRuntime();
    await tick();

    const claimCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:claimNextOutbound",
    );

    expect(claimCalls.length).toBeGreaterThanOrEqual(1);
    expect(claimCalls[0]![1]).toMatchObject({
      processorId: "telegram-worker",
      channel: "telegram",
      accountId: "telegram-default",
      lockMs: 120_000,
    });

    void p;
  });

  it("sends job and completes on assistant_message kind", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return { _id: "job-a", to: "tg:12345", payload: { content: "Hello from telegram" } };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });

    mockedSend.mockResolvedValue(987);
    const p = startTelegramRuntime();
    await tick();

    expect(mockedSend).toHaveBeenCalledWith("tg:12345", "Hello from telegram");

    const completeCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:completeOutbound",
    );
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]![1]).toMatchObject({ id: "job-a" });

    void p;
  });

  it("streams assistant_message_chunk updates existing message drafts", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return {
            _id: "job-b",
            to: "-999",
            payload: {
              content: "initial chunk",
              metadata: { kind: "assistant_message_chunk", toolName: "search" },
            },
          };
        }
        if (claimCount === 2) {
          return {
            _id: "job-c",
            to: "-999",
            payload: {
              content: "updated chunk",
              metadata: { kind: "assistant_message_chunk", toolName: "search" },
            },
          };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });

    mockedSend.mockResolvedValue(321);
    mockedEdit.mockResolvedValue(undefined);

    const p = startTelegramRuntime();
    await tick();

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedEdit).toHaveBeenCalledTimes(1);
    expect(mockedEdit).toHaveBeenCalledWith("-999", 321, "updated chunk");

    void p;
  });

  it("fails jobs missing recipients without retry", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return { _id: "job-d", to: undefined, payload: { content: "No recipient" } };
        }
        return hang();
      }
      if (fn === "delivery:failOutbound") return undefined;
      return undefined;
    });

    const p = startTelegramRuntime();
    await tick();

    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedTyping).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();

    const failCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:failOutbound",
    );
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0]![1]).toMatchObject({
      id: "job-d",
      error: "Missing recipient for Telegram outbound message",
      retry: false,
    });

    void p;
  });

  it("marks job failed when sender throws", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return { _id: "job-e", to: "-999", payload: { content: "fail now" } };
        }
        return hang();
      }
      if (fn === "delivery:failOutbound") return undefined;
      return undefined;
    });

    mockedSend.mockRejectedValue(new Error("telegram API temporarily unavailable"));

    const p = startTelegramRuntime();
    await tick();

    const failCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:failOutbound",
    );
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0]![1]).toMatchObject({
      id: "job-e",
      error: "telegram API temporarily unavailable",
    });

    void p;
  });
});
