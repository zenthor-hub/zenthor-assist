import { describe, expect, it } from "vitest";

import { classifyError, isRetryable } from "./errors";

describe("classifyError", () => {
  it("classifies rate limit by status 429", () => {
    const err = Object.assign(new Error("request failed"), { status: 429 });
    expect(classifyError(err)).toBe("rate_limit");
  });

  it("classifies rate limit by message", () => {
    expect(classifyError(new Error("rate limit exceeded"))).toBe("rate_limit");
    expect(classifyError(new Error("too many requests"))).toBe("rate_limit");
    expect(classifyError("quota exceeded")).toBe("rate_limit");
  });

  it("classifies timeout errors", () => {
    expect(classifyError(new Error("request timed out"))).toBe("timeout");
    expect(classifyError(new Error("ETIMEDOUT"))).toBe("timeout");
  });

  it("classifies auth errors", () => {
    expect(classifyError(new Error("unauthorized"))).toBe("auth");
    expect(classifyError(new Error("invalid api key"))).toBe("auth");
    const err403 = Object.assign(new Error("forbidden"), { status: 403 });
    expect(classifyError(err403)).toBe("auth");
  });

  it("classifies billing errors", () => {
    const err = Object.assign(new Error("payment required"), { status: 402 });
    expect(classifyError(err)).toBe("billing");
  });

  it("classifies format errors", () => {
    expect(classifyError(new Error("invalid request body"))).toBe("format");
    expect(classifyError(new Error("Bad Request"))).toBe("format");
    const apiErr = Object.assign(new Error("Bad Request"), { status: 400 });
    expect(classifyError(apiErr)).toBe("format");
  });

  it("classifies context overflow", () => {
    expect(classifyError(new Error("context length exceeded"))).toBe("context_overflow");
    expect(classifyError(new Error("too many tokens"))).toBe("context_overflow");
  });

  it("classifies server errors by status", () => {
    expect(classifyError(Object.assign(new Error("fail"), { status: 500 }))).toBe("server_error");
    expect(classifyError(Object.assign(new Error("fail"), { status: 502 }))).toBe("server_error");
    expect(classifyError(Object.assign(new Error("fail"), { status: 503 }))).toBe("server_error");
    expect(classifyError(Object.assign(new Error("fail"), { status: 504 }))).toBe("server_error");
  });

  it("classifies server errors by message", () => {
    expect(classifyError(new Error("internal server error"))).toBe("server_error");
    expect(classifyError(new Error("bad gateway"))).toBe("server_error");
    expect(classifyError(new Error("service unavailable"))).toBe("server_error");
    expect(classifyError(new Error("model overloaded"))).toBe("server_error");
  });

  it("classifies network errors", () => {
    expect(classifyError(new Error("ENOTFOUND"))).toBe("network");
    expect(classifyError(new Error("ECONNREFUSED"))).toBe("network");
    expect(classifyError(new Error("ECONNRESET"))).toBe("network");
    expect(classifyError(new Error("fetch failed"))).toBe("network");
  });

  it("classifies content filter errors", () => {
    expect(classifyError(new Error("content filtering triggered"))).toBe("content_filter");
    expect(classifyError(new Error("blocked by safety system"))).toBe("content_filter");
  });

  it("returns unknown for unrecognized errors", () => {
    expect(classifyError(new Error("something went wrong"))).toBe("unknown");
    expect(classifyError(42)).toBe("unknown");
  });

  it("handles plain objects with message and status", () => {
    expect(classifyError({ message: "rate limit", status: 429 })).toBe("rate_limit");
  });
});

describe("isRetryable", () => {
  it("rate_limit is retryable", () => expect(isRetryable("rate_limit")).toBe(true));
  it("timeout is retryable", () => expect(isRetryable("timeout")).toBe(true));
  it("server_error is retryable", () => expect(isRetryable("server_error")).toBe(true));
  it("network is retryable", () => expect(isRetryable("network")).toBe(true));
  it("auth is not retryable", () => expect(isRetryable("auth")).toBe(false));
  it("billing is not retryable", () => expect(isRetryable("billing")).toBe(false));
  it("content_filter is not retryable", () => expect(isRetryable("content_filter")).toBe(false));
  it("format is not retryable", () => expect(isRetryable("format")).toBe(false));
  it("context_overflow is not retryable", () =>
    expect(isRetryable("context_overflow")).toBe(false));
  it("unknown is not retryable", () => expect(isRetryable("unknown")).toBe(false));
});
