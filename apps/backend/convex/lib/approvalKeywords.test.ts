import { describe, expect, it } from "vitest";

import { classifyApprovalText } from "./approvalKeywords";

describe("classifyApprovalText", () => {
  it.each(["YES", "yes", "Yes", "Y", "y", "APPROVE", "approve", "SIM", "sim"])(
    "classifies '%s' as approved",
    (text) => {
      expect(classifyApprovalText(text)).toBe("approved");
    },
  );

  it.each(["NO", "no", "No", "N", "n", "REJECT", "reject", "NAO", "nao", "NÃO", "não"])(
    "classifies '%s' as rejected",
    (text) => {
      expect(classifyApprovalText(text)).toBe("rejected");
    },
  );

  it("handles leading/trailing whitespace", () => {
    expect(classifyApprovalText("  yes  ")).toBe("approved");
    expect(classifyApprovalText("  no  ")).toBe("rejected");
  });

  it("returns null for non-keyword text", () => {
    expect(classifyApprovalText("maybe")).toBeNull();
    expect(classifyApprovalText("hello")).toBeNull();
    expect(classifyApprovalText("yes please")).toBeNull();
    expect(classifyApprovalText("")).toBeNull();
    expect(classifyApprovalText("   ")).toBeNull();
  });

  it("returns null for partial keyword matches", () => {
    expect(classifyApprovalText("yess")).toBeNull();
    expect(classifyApprovalText("noo")).toBeNull();
    expect(classifyApprovalText("approved")).toBeNull();
    expect(classifyApprovalText("rejected")).toBeNull();
  });
});
