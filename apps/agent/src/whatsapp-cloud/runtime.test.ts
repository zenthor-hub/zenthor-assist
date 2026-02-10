import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (must be before imports) ---

const mockMutation = vi.fn();

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    AGENT_SECRET: "test-secret",
    WORKER_ID: "test-worker",
    WHATSAPP_LEASE_TTL_MS: 45_000,
    WHATSAPP_HEARTBEAT_MS: 15_000,
    WHATSAPP_CLOUD_ACCOUNT_ID: undefined,
    WHATSAPP_CLOUD_PHONE: undefined,
  },
}));

vi.mock("../convex/client", () => ({
  getConvexClient: () => ({ mutation: mockMutation }),
}));

vi.mock("./sender", () => ({
  sendCloudApiMessage: vi.fn(),
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

import { startWhatsAppCloudRuntime } from "./runtime";
import { sendCloudApiMessage } from "./sender";

const mockedSend = vi.mocked(sendCloudApiMessage);

/** Promise that never resolves — used to freeze infinite loops. */
function hang<T = unknown>(): Promise<T> {
  return new Promise<T>(() => {});
}

/** Flush microtask queue so fire-and-forget async work can proceed. */
function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Default mock: lease acquired immediately, outbound loop freezes on first claim.
 * Tests that need outbound iterations override claimNextOutbound behavior.
 */
function setupDefaultMock() {
  mockMutation.mockImplementation(async (fn: string) => {
    if (fn === "whatsappLeases:upsertAccount") return undefined;
    if (fn === "whatsappLeases:acquireLease") {
      return { acquired: true, expiresAt: Date.now() + 45_000 };
    }
    if (fn === "whatsappLeases:heartbeatLease") return true;
    if (fn === "whatsappLeases:releaseLease") return true;
    // Freeze the outbound loop so it doesn't spin
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

describe("startWhatsAppCloudRuntime", () => {
  it("calls upsertAccount with cloud-api accountId", async () => {
    const p = startWhatsAppCloudRuntime();
    await tick();

    const upsertCall = mockMutation.mock.calls.find(
      (call: unknown[]) => call[0] === "whatsappLeases:upsertAccount",
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1]).toMatchObject({
      serviceKey: "test-secret",
      accountId: "cloud-api",
      enabled: true,
    });

    // p never resolves (loop is frozen) — that's OK, test is done
    void p;
  });

  it("acquires lease for cloud-api account", async () => {
    const p = startWhatsAppCloudRuntime();
    await tick();

    const leaseCall = mockMutation.mock.calls.find(
      (call: unknown[]) => call[0] === "whatsappLeases:acquireLease",
    );
    expect(leaseCall).toBeDefined();
    expect(leaseCall![1]).toMatchObject({
      accountId: "cloud-api",
      ownerId: "test-worker",
    });

    void p;
  });

  it("starts outbound loop that claims jobs", async () => {
    const p = startWhatsAppCloudRuntime();
    await tick();

    const claimCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:claimNextOutbound",
    );
    expect(claimCalls.length).toBeGreaterThanOrEqual(1);
    expect(claimCalls[0]![1]).toMatchObject({
      processorId: "test-worker",
      channel: "whatsapp",
      accountId: "cloud-api",
      lockMs: 120_000,
    });

    void p;
  });

  it("sends message and completes job on successful delivery", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return {
            _id: "job1",
            to: "+5511999999999",
            payload: { content: "Hello from test" },
          };
        }
        return hang(); // Freeze after first job
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });
    mockedSend.mockResolvedValue("wamid.test123");

    const p = startWhatsAppCloudRuntime();
    await tick();

    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Hello from test");

    const completeCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:completeOutbound",
    );
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]![1]).toMatchObject({ id: "job1" });

    void p;
  });

  it("fails job when send throws an error (bounded failure)", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return {
            _id: "job2",
            to: "+5511999999999",
            payload: { content: "Will fail" },
          };
        }
        return hang();
      }
      if (fn === "delivery:failOutbound") return undefined;
      return undefined;
    });
    mockedSend.mockRejectedValue(new Error("WhatsApp Cloud API error: Invalid token"));

    const p = startWhatsAppCloudRuntime();
    await tick();

    const failCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:failOutbound",
    );
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0]![1]).toMatchObject({
      id: "job2",
      error: "WhatsApp Cloud API error: Invalid token",
    });

    void p;
  });

  it("fails job with retry=false when recipient phone is missing", async () => {
    let claimCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "delivery:claimNextOutbound") {
        claimCount++;
        if (claimCount === 1) {
          return {
            _id: "job3",
            to: undefined,
            payload: { content: "No recipient" },
          };
        }
        return hang();
      }
      if (fn === "delivery:failOutbound") return undefined;
      return undefined;
    });

    const p = startWhatsAppCloudRuntime();
    await tick();

    expect(mockedSend).not.toHaveBeenCalled();

    const failCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:failOutbound",
    );
    expect(failCalls).toHaveLength(1);
    expect(failCalls[0]![1]).toMatchObject({
      id: "job3",
      error: "Missing recipient phone for WhatsApp Cloud API outbound message",
      retry: false,
    });

    void p;
  });

  it("retries lease acquisition when lease is held by another worker", async () => {
    let acquireCount = 0;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        acquireCount++;
        if (acquireCount === 1) {
          return { acquired: false, ownerId: "other-worker", expiresAt: Date.now() + 10_000 };
        }
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "delivery:claimNextOutbound") return hang();
      return undefined;
    });

    const p = startWhatsAppCloudRuntime();
    // acquireLease fails → sleep(3_000) → retry → succeeds
    await tick(3_500);

    expect(acquireCount).toBe(2);
    void p;
  });

  it("warns when WHATSAPP_CLOUD_ACCOUNT_ID differs from cloud-api", async () => {
    const envMod = await import("@zenthor-assist/env/agent");
    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCOUNT_ID = "custom-id";

    const { logger } = await import("../observability/logger");

    const p = startWhatsAppCloudRuntime();
    await tick();

    expect(logger.lineWarn).toHaveBeenCalledWith(
      expect.stringContaining("Ignoring WHATSAPP_CLOUD_ACCOUNT_ID='custom-id'"),
    );

    (envMod.env as Record<string, unknown>).WHATSAPP_CLOUD_ACCOUNT_ID = undefined;
    void p;
  });

  it("reacquires lease and resumes outbound sends when heartbeat returns false", async () => {
    let heartbeatCount = 0;
    let acquireCount = 0;
    let delivered = false;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        acquireCount++;
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") {
        heartbeatCount++;
        return heartbeatCount === 1 ? false : true;
      }
      if (fn === "delivery:claimNextOutbound") {
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

    const p = startWhatsAppCloudRuntime();
    await vi.advanceTimersByTimeAsync(50);
    expect(acquireCount).toBe(1);

    // Trigger heartbeat interval; first heartbeat returns false and marks lease as lost.
    await vi.advanceTimersByTimeAsync(15_000);

    // Give outbound loop time to recover lease and process one job.
    await vi.advanceTimersByTimeAsync(5_000);

    expect(acquireCount).toBeGreaterThanOrEqual(2);
    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Recovered delivery");

    void p;
  });

  it("retries acquireLease during recovery when lease is contended by another worker", async () => {
    let heartbeatCount = 0;
    let acquireCount = 0;
    let delivered = false;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        acquireCount++;
        // 1st call: startup — succeeds immediately
        if (acquireCount === 1) {
          return { acquired: true, expiresAt: Date.now() + 45_000 };
        }
        // 2nd call: recovery attempt — contended by another worker
        if (acquireCount === 2) {
          return { acquired: false, ownerId: "other-worker", expiresAt: Date.now() + 10_000 };
        }
        // 3rd+ call: recovery retry — succeeds
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") {
        heartbeatCount++;
        // First heartbeat fails, triggering lease lost
        return heartbeatCount === 1 ? false : true;
      }
      if (fn === "delivery:claimNextOutbound") {
        // Only deliver after lease recovery succeeds (acquireCount >= 3)
        if (acquireCount < 3) return null;
        if (!delivered) {
          delivered = true;
          return {
            _id: "job-contended-recovery",
            to: "+5511999999999",
            payload: { content: "Recovered after contention" },
          };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });
    mockedSend.mockResolvedValue("wamid.contended123");

    vi.useFakeTimers();

    const p = startWhatsAppCloudRuntime();
    await vi.advanceTimersByTimeAsync(50);
    expect(acquireCount).toBe(1);

    // Trigger heartbeat — returns false, sets leaseLost = true
    await vi.advanceTimersByTimeAsync(15_000);

    // Outbound loop detects leaseLost, calls acquireLease → contended (acquireCount=2)
    // acquireLease sleeps 3s, retries → succeeds (acquireCount=3)
    // Then outbound loop resumes and claims job
    await vi.advanceTimersByTimeAsync(5_000);

    expect(acquireCount).toBeGreaterThanOrEqual(3);
    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Recovered after contention");

    const completeCalls = mockMutation.mock.calls.filter(
      (call: unknown[]) => call[0] === "delivery:completeOutbound",
    );
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]![1]).toMatchObject({ id: "job-contended-recovery" });

    void p;
  });

  it("reacquires lease and resumes outbound sends when heartbeat throws", async () => {
    let heartbeatCount = 0;
    let acquireCount = 0;
    let delivered = false;
    mockMutation.mockImplementation(async (fn: string) => {
      if (fn === "whatsappLeases:upsertAccount") return undefined;
      if (fn === "whatsappLeases:acquireLease") {
        acquireCount++;
        return { acquired: true, expiresAt: Date.now() + 45_000 };
      }
      if (fn === "whatsappLeases:heartbeatLease") {
        heartbeatCount++;
        if (heartbeatCount === 1) throw new Error("Transient heartbeat failure");
        return true;
      }
      if (fn === "delivery:claimNextOutbound") {
        if (acquireCount < 2) return null;
        if (!delivered) {
          delivered = true;
          return {
            _id: "job-recovered-error",
            to: "+5511999999999",
            payload: { content: "Recovered after heartbeat error" },
          };
        }
        return hang();
      }
      if (fn === "delivery:completeOutbound") return undefined;
      return undefined;
    });

    vi.useFakeTimers();

    const p = startWhatsAppCloudRuntime();
    await vi.advanceTimersByTimeAsync(50);
    expect(acquireCount).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(acquireCount).toBeGreaterThanOrEqual(2);
    expect(mockedSend).toHaveBeenCalledWith("+5511999999999", "Recovered after heartbeat error");

    void p;
  });
});
