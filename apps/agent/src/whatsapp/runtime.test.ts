import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockMutation = vi.fn();

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    AGENT_SECRET: "test-secret",
    WORKER_ID: "test-worker",
    WHATSAPP_LEASE_TTL_MS: 45_000,
    WHATSAPP_HEARTBEAT_MS: 15_000,
    WHATSAPP_ACCOUNT_ID: "test-account",
    WHATSAPP_PHONE: "test-account",
  },
}));

vi.mock("../convex/client", () => ({
  getConvexClient: () => ({ mutation: mockMutation }),
}));

vi.mock("./sender", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("./connection", () => ({
  startWhatsApp: vi.fn(),
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
    whatsappLeases: {
      upsertAccount: "whatsappLeases:upsertAccount",
      acquireLease: "whatsappLeases:acquireLease",
      heartbeatLease: "whatsappLeases:heartbeatLease",
      releaseLease: "whatsappLeases:releaseLease",
    },
    delivery: {
      claimNextOutbound: "delivery:claimNextOutbound",
      completeOutbound: "delivery:completeOutbound",
      failOutbound: "delivery:failOutbound",
    },
  },
}));

import { startWhatsAppRuntime } from "./runtime";
import { sendWhatsAppMessage } from "./sender";

const mockedSend = vi.mocked(sendWhatsAppMessage);

function hang<T = unknown>(): Promise<T> {
  return new Promise<T>(() => {});
}

function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function setupDefaultMock() {
  mockMutation.mockImplementation(async (fn: string) => {
    if (fn === "whatsappLeases:upsertAccount") return undefined;
    if (fn === "whatsappLeases:acquireLease") {
      return { acquired: true, ownerId: "test-worker", expiresAt: Date.now() + 45_000 };
    }
    if (fn === "whatsappLeases:heartbeatLease") return true;
    if (fn === "whatsappLeases:releaseLease") return true;
    if (fn === "delivery:claimNextOutbound") return hang();
    return undefined;
  });
}

beforeEach(() => {
  mockMutation.mockReset();
  mockedSend.mockReset();
  setupDefaultMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startWhatsAppRuntime", () => {
  it("acquires lease and starts outbound loop", async () => {
    const p = startWhatsAppRuntime({ enableIngress: false, enableEgress: true });
    await tick();

    const acquireCall = mockMutation.mock.calls.find(
      (call: unknown[]) => call[0] === "whatsappLeases:acquireLease",
    );
    expect(acquireCall).toBeDefined();
    expect(acquireCall![1]).toMatchObject({
      accountId: "test-account",
      ownerId: "test-worker",
    });

    const claimCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:claimNextOutbound",
    );
    expect(claimCalls.length).toBeGreaterThanOrEqual(1);
    expect(claimCalls[0]![1]).toMatchObject({
      processorId: "test-worker",
      channel: "whatsapp",
      accountId: "test-account",
      lockMs: 120_000,
    });

    void p;
  });

  it("sends message and marks job complete", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        return { acquired: true, ownerId: "test-worker", expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") return true;
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return { _id: "job1", to: "+5511999999999", payload: { content: "Hello from test" } };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });

    mockedSend.mockResolvedValue(undefined);
    const p = startWhatsAppRuntime({ enableIngress: false, enableEgress: true });
    await tick();

    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Hello from test");

    const completeCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:completeOutbound",
    );
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]![1]).toMatchObject({ id: "job1" });

    void p;
  });

  it("fails job with retry=false when recipient phone is missing", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        return { acquired: true, ownerId: "test-worker", expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") return true;
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return { _id: "job2", to: undefined, payload: { content: "No recipient" } };
        }
        return hang();
      }
      if (fn === "delivery:failOutbound") return undefined;
      return undefined;
    });

    const p = startWhatsAppRuntime({ enableIngress: false, enableEgress: true });
    await tick();

    expect(mockedSend).not.toHaveBeenCalled();

    const failCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:failOutbound",
    );
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0]![1]).toMatchObject({
      id: "job2",
      error: "Missing recipient phone for WhatsApp outbound message",
      retry: false,
    });

    void p;
  });

  it("pauses outbound sending while lease is lost and resumes after heartbeat recovery", async () => {
    let heartbeatCount = 0;
    let acquireCount = 0;
    let delivered = false;

    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        acquireCount++;
        return { acquired: true, ownerId: "test-worker", expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") {
        heartbeatCount++;
        return heartbeatCount === 1 ? false : true;
      }
      if (fn === "delivery:claimNextOutbound") {
        // block sending until lease is reacquired after the first failed heartbeat
        if (acquireCount < 2) return null;
        if (!delivered) {
          delivered = true;
          return {
            _id: "job-recovered",
            to: "+5511999999999",
            payload: { content: "Recovered delivery" },
          };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });

    vi.useFakeTimers();
    mockedSend.mockResolvedValue(undefined);

    const p = startWhatsAppRuntime({ enableIngress: false, enableEgress: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(acquireCount).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(acquireCount).toBeGreaterThanOrEqual(2);
    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Recovered delivery");
    void p;
  });
});
