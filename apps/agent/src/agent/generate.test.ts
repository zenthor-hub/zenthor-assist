import { describe, expect, it } from "vitest";

import { isLikelyNewNoteRequest } from "./generate";

describe("isLikelyNewNoteRequest", () => {
  it("returns false for explicit rewrite workflows", () => {
    const result = isLikelyNewNoteRequest([
      { role: "user", content: "Can you rewrite this note in a clearer style?" },
    ]);

    expect(result).toBe(false);
  });

  it("returns true for explicit create-note command", () => {
    const result = isLikelyNewNoteRequest([
      { role: "assistant", content: "Done — note ready." },
      { role: "user", content: "/create-note: travel plan" },
    ]);

    expect(result).toBe(true);
  });

  it("returns true for natural-language new note requests", () => {
    const result = isLikelyNewNoteRequest([
      { role: "assistant", content: "Sure, I saved it." },
      { role: "user", content: "Please create a new note for my Finland trip." },
    ]);

    expect(result).toBe(true);
  });

  it("returns false for create request targeting the current existing note", () => {
    const result = isLikelyNewNoteRequest([
      { role: "user", content: "Can you create this note with cleaner headings?" },
    ]);

    expect(result).toBe(false);
  });

  it("returns false when message is unrelated to notes", () => {
    const result = isLikelyNewNoteRequest([
      { role: "user", content: "What is the weather in Oslo this week?" },
      { role: "assistant", content: "It's sunny." },
    ]);

    expect(result).toBe(false);
  });
});
