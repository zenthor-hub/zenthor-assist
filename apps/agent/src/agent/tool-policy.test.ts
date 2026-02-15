import { describe, expect, it } from "vitest";

import { filterTools, mergeToolPolicies, getDefaultPolicy } from "./tool-policy";

describe("filterTools", () => {
  const tools = {
    search: { execute: () => {} },
    calculate: { execute: () => {} },
    dangerous: { execute: () => {} },
  };

  it("returns all tools with empty policy", () => {
    expect(Object.keys(filterTools(tools, {}))).toEqual(["search", "calculate", "dangerous"]);
  });

  it("filters by allow list", () => {
    const result = filterTools(tools, { allow: ["search", "calculate"] });
    expect(Object.keys(result)).toEqual(["search", "calculate"]);
  });

  it("filters by deny list", () => {
    const result = filterTools(tools, { deny: ["dangerous"] });
    expect(Object.keys(result)).toEqual(["search", "calculate"]);
  });

  it("deny takes precedence over allow", () => {
    const result = filterTools(tools, { allow: ["search", "dangerous"], deny: ["dangerous"] });
    expect(Object.keys(result)).toEqual(["search"]);
  });
});

describe("mergeToolPolicies", () => {
  it("merges deny lists with union", () => {
    const result = mergeToolPolicies({ deny: ["a"] }, { deny: ["b"] });
    expect(result.deny?.sort()).toEqual(["a", "b"]);
  });

  it("merges allow lists with intersection", () => {
    const result = mergeToolPolicies({ allow: ["a", "b"] }, { allow: ["b", "c"] });
    expect(result.allow).toEqual(["b"]);
  });

  it("deduplicates deny entries", () => {
    const result = mergeToolPolicies({ deny: ["a"] }, { deny: ["a"] });
    expect(result.deny).toEqual(["a"]);
  });
});

describe("getDefaultPolicy", () => {
  it("returns an explicit web allowlist", () => {
    const policy = getDefaultPolicy("web");
    expect(policy.allow).toBeDefined();
    expect(policy.allow).toContain("schedule_task");
    expect(policy.allow).toContain("browse_url");
    expect(policy.allow).toContain("note_update_from_ai");
  });

  it("returns an explicit whatsapp allowlist", () => {
    const policy = getDefaultPolicy("whatsapp");
    expect(policy.allow).toBeDefined();
    expect(policy.allow).toContain("schedule_task");
    expect(policy.allow).toContain("browse_url");
    expect(policy.allow).toContain("note_create");
    expect(policy.allow).toContain("note_update_from_ai");
  });

  it("returns an explicit telegram allowlist", () => {
    const policy = getDefaultPolicy("telegram");
    expect(policy.allow).toBeDefined();
    expect(policy.allow).toContain("schedule_task");
    expect(policy.allow).toContain("browse_url");
  });
});
