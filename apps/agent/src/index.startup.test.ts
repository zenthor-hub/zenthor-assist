import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  lineInfo: vi.fn(async () => {}),
  lineWarn: vi.fn(async () => {}),
  lineError: vi.fn(async () => {}),
  lineDebug: vi.fn(async () => {}),
  info: vi.fn(async () => {}),
  warn: vi.fn(async () => {}),
  error: vi.fn(async () => {}),
  exception: vi.fn(async () => {}),
  flush: vi.fn(async () => {}),
};

vi.mock("@zenthor-assist/env/agent", () => ({
  env: {
    CONVEX_URL: "https://example.convex.cloud",
    CODE_AWARENESS_ENABLED: false,
    CODE_MAINTENANCE_MODE: true,
    AI_LITE_MODEL: "xai/grok-4.1-fast-reasoning",
    AI_MODEL: "anthropic/claude-sonnet-4-5-20250929",
  },
}));

vi.mock("./agent/ai-gateway", () => ({
  getProviderMode: vi.fn(() => "gateway"),
}));

vi.mock("./env-requirements", () => ({
  getRequiredEnvForRole: vi.fn(() => []),
  getRecommendedEnvForRole: vi.fn(() => []),
  getModelCompatibilityErrors: vi.fn(() => []),
}));

vi.mock("./observability/logger", () => ({
  logger,
}));

vi.mock("./observability/sentry", () => ({
  initSentry: vi.fn(() => {}),
}));

vi.mock("./agent/loop", () => ({
  startAgentLoop: vi.fn(async () => {}),
}));

vi.mock("./telegram/runtime", () => ({
  startTelegramRuntime: vi.fn(async () => {}),
}));

vi.mock("./whatsapp-cloud/runtime", () => ({
  startWhatsAppCloudRuntime: vi.fn(async () => {}),
}));

vi.mock("./whatsapp/runtime", () => ({
  startWhatsAppRuntime: vi.fn(async () => {}),
}));

describe("agent startup", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["AGENT_ROLE"] = "core";
    process.env["CODE_AWARENESS_ENABLED"] = "false";
    process.env["CODE_MAINTENANCE_MODE"] = "true";
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env["AGENT_ROLE"];
    delete process.env["CODE_AWARENESS_ENABLED"];
    delete process.env["CODE_MAINTENANCE_MODE"];
  });

  it("logs a code tool alignment warning when maintenance mode is enabled without awareness", async () => {
    await import("./index");

    expect(logger.warn).toHaveBeenCalledWith("agent.code_tools.misaligned_configuration", {
      codeAwarenessEnabled: false,
      codeMaintenanceMode: true,
    });
  });

  it("does not log a code tool alignment warning when maintenance mode is disabled", async () => {
    process.env["CODE_MAINTENANCE_MODE"] = "false";
    process.env["CODE_AWARENESS_ENABLED"] = "false";

    await import("./index");

    expect(logger.warn).not.toHaveBeenCalledWith("agent.code_tools.misaligned_configuration", {
      codeAwarenessEnabled: false,
      codeMaintenanceMode: false,
    });
  });

  it("does not log a code tool alignment warning when both awareness and maintenance are enabled", async () => {
    process.env["CODE_MAINTENANCE_MODE"] = "true";
    process.env["CODE_AWARENESS_ENABLED"] = "true";

    await import("./index");

    expect(logger.warn).not.toHaveBeenCalledWith("agent.code_tools.misaligned_configuration", {
      codeAwarenessEnabled: true,
      codeMaintenanceMode: true,
    });
  });
});
