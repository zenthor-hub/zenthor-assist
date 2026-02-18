import { describe, expect, it } from "vitest";

import { shouldWarnForCodeMaintenanceAlignment } from "./code-startup";

describe("shouldWarnForCodeMaintenanceAlignment", () => {
  it("warns when maintenance mode is enabled without awareness", () => {
    expect(
      shouldWarnForCodeMaintenanceAlignment({
        codeAwarenessEnabled: false,
        codeMaintenanceMode: true,
      }),
    ).toBe(true);
  });

  it("does not warn when both flags are enabled", () => {
    expect(
      shouldWarnForCodeMaintenanceAlignment({
        codeAwarenessEnabled: true,
        codeMaintenanceMode: true,
      }),
    ).toBe(false);
  });

  it("does not warn when maintenance mode is disabled", () => {
    expect(
      shouldWarnForCodeMaintenanceAlignment({
        codeAwarenessEnabled: false,
        codeMaintenanceMode: false,
      }),
    ).toBe(false);
  });
});
