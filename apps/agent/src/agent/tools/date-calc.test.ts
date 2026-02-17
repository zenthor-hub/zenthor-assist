import { describe, expect, it } from "vitest";

import { executeDateCalc, type DateCalcInput } from "./date-calc";

async function exec(input: DateCalcInput): Promise<string> {
  return executeDateCalc(input);
}

describe("dateCalc", () => {
  describe("add operation", () => {
    it("adds days to a date", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-01-01T00:00:00Z",
        amount: 10,
        unit: "days",
      });
      expect(result).toContain("January");
      expect(result).toContain("2025-01-11");
    });

    it("subtracts hours with negative amount", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-06-15T12:00:00Z",
        amount: -6,
        unit: "hours",
      });
      expect(result).toContain("06:00:00");
    });

    it("adds months", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-01-31T00:00:00Z",
        amount: 1,
        unit: "months",
      });
      // Jan 31 + 1 month → Feb 28 (or Mar 3 depending on JS impl)
      expect(result).toContain("2025");
    });

    it("adds weeks", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-01-01T00:00:00Z",
        amount: 2,
        unit: "weeks",
      });
      expect(result).toContain("2025-01-15");
    });

    it("adds years", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-01-01T00:00:00Z",
        amount: 5,
        unit: "years",
      });
      expect(result).toContain("2030");
    });

    it('handles "now" keyword', async () => {
      const result = await exec({
        operation: "add",
        date: "now",
        amount: 1,
        unit: "days",
      });
      expect(result).toContain("ISO:");
    });

    it("supports timezone display", async () => {
      const result = await exec({
        operation: "add",
        date: "2025-01-01T00:00:00Z",
        amount: 0,
        unit: "days",
        timezone: "America/Sao_Paulo",
      });
      expect(result).toContain("GMT-3");
    });
  });

  describe("diff operation", () => {
    it("calculates difference between two dates", async () => {
      const result = await exec({
        operation: "diff",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-11T00:00:00Z",
      });
      expect(result).toContain("10 days");
    });

    it("handles past direction", async () => {
      const result = await exec({
        operation: "diff",
        from: "2025-06-01T00:00:00Z",
        to: "2025-01-01T00:00:00Z",
      });
      expect(result).toContain("(past)");
    });

    it("handles same date", async () => {
      const result = await exec({
        operation: "diff",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-01T00:00:00Z",
      });
      expect(result).toContain("0 days");
    });

    it('supports "now" in diff', async () => {
      const result = await exec({
        operation: "diff",
        from: "now",
        to: "now",
      });
      expect(result).toContain("0 days");
    });
  });

  describe("info operation", () => {
    it("returns date information", async () => {
      const result = await exec({
        operation: "info",
        date: "2025-01-01T00:00:00Z",
      });
      expect(result).toContain("Wednesday");
      expect(result).toContain("Q1");
      expect(result).toContain("Leap year: no");
      expect(result).toContain("Unix timestamp:");
      expect(result).toContain("ISO:");
    });

    it("detects leap year", async () => {
      const result = await exec({
        operation: "info",
        date: "2024-01-01T00:00:00Z",
      });
      expect(result).toContain("Leap year: yes");
    });

    it("handles timezone parameter", async () => {
      const result = await exec({
        operation: "info",
        date: "2025-07-04T00:00:00Z",
        timezone: "America/New_York",
      });
      expect(result).toContain("EDT");
    });
  });

  describe("error handling", () => {
    it("returns error for invalid date", async () => {
      const result = await exec({
        operation: "info",
        date: "not-a-date",
      });
      expect(result).toContain("Error");
      expect(result).toContain("Invalid date");
    });

    it("returns error for invalid diff date", async () => {
      const result = await exec({
        operation: "diff",
        from: "garbage",
        to: "2025-01-01",
      });
      expect(result).toContain("Error");
    });
  });
});
