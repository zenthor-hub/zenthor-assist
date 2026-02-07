import { describe, expect, it, vi } from "vitest";

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
}));

import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit exceeded"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("unauthorized"));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("rate limit"));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow(
      "rate limit",
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
