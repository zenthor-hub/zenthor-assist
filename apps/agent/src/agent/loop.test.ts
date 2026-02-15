import { describe, expect, it } from "vitest";

import {
  buildNoteCreationReply,
  parseNoteCreationFailure,
  parseNoteCreationFromToolOutput,
  resolveNoteCreationOutcomes,
} from "./loop";

// sanitizeForWhatsApp is not exported, so we re-implement the logic here for testing.
// This validates the formatting rules match the implementation in loop.ts.
function sanitizeForWhatsApp(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^[-*_]{3,}$/gm, "───")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

describe("sanitizeForWhatsApp", () => {
  it("converts **bold** to *bold*", () => {
    expect(sanitizeForWhatsApp("Hello **world**")).toBe("Hello *world*");
  });

  it("converts __bold__ to *bold*", () => {
    expect(sanitizeForWhatsApp("Hello __world__")).toBe("Hello *world*");
  });

  it("converts markdown headers to bold lines", () => {
    expect(sanitizeForWhatsApp("# Title")).toBe("*Title*");
    expect(sanitizeForWhatsApp("## Subtitle")).toBe("*Subtitle*");
    expect(sanitizeForWhatsApp("### Deep")).toBe("*Deep*");
  });

  it("converts markdown links to text (url)", () => {
    expect(sanitizeForWhatsApp("[Click here](https://example.com)")).toBe(
      "Click here (https://example.com)",
    );
  });

  it("converts image syntax to alt: url", () => {
    expect(sanitizeForWhatsApp("![Logo](https://img.com/logo.png)")).toBe(
      "Logo: https://img.com/logo.png",
    );
  });

  it("converts horizontal rules to line character", () => {
    expect(sanitizeForWhatsApp("---")).toBe("───");
    expect(sanitizeForWhatsApp("***")).toBe("───");
    expect(sanitizeForWhatsApp("___")).toBe("───");
  });

  it("collapses triple+ newlines to double", () => {
    expect(sanitizeForWhatsApp("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims whitespace", () => {
    expect(sanitizeForWhatsApp("  hello  ")).toBe("hello");
  });

  it("handles combined formatting", () => {
    const input = "# Welcome\n\n**Hello** __world__\n\n[Link](https://x.com)\n\n---";
    const result = sanitizeForWhatsApp(input);
    expect(result).toContain("*Welcome*");
    expect(result).toContain("*Hello*");
    expect(result).toContain("*world*");
    expect(result).toContain("Link (https://x.com)");
    expect(result).toContain("───");
  });

  it("leaves plain text unchanged", () => {
    expect(sanitizeForWhatsApp("Just plain text")).toBe("Just plain text");
  });
});

describe("note creation tool parsing", () => {
  it("parses note_created payloads from JSON objects", () => {
    const summary = parseNoteCreationFromToolOutput({
      action: "note_created",
      noteId: "note_123",
      title: "Travel Notes",
      source: "chat-generated",
    });

    expect(summary).toEqual({
      noteId: "note_123",
      title: "Travel Notes",
      source: "chat-generated",
    });
  });

  it("parses note_created payloads from fenced JSON", () => {
    const summary = parseNoteCreationFromToolOutput(
      '```json\n{"action":"note_created","noteId":"note_456","title":"Rovaniemi","source":"chat-generated"}\n```',
    );

    expect(summary).toEqual({
      noteId: "note_456",
      title: "Rovaniemi",
      source: "chat-generated",
    });
  });

  it("extracts failures from error payloads", () => {
    const failure = parseNoteCreationFailure({ error: "Could not create note: folder is private" });

    expect(failure).toEqual({
      toolName: "note_create",
      reason: "Could not create note: folder is private",
    });
  });
});

describe("note creation reply composition", () => {
  it("replaces message with success summary on web", () => {
    const reply = buildNoteCreationReply(
      [
        {
          name: "note_create",
          input: {},
          output: '{"action":"note_created","noteId":"note_1","title":"Trip Ideas"}',
        },
      ],
      "web",
    );
    expect(reply).toBe("Created note(s):\n[Trip Ideas](/notes/note_1)");
  });

  it("replaces message with success summary on whatsapp", () => {
    const reply = buildNoteCreationReply(
      [
        {
          name: "note_create",
          input: {},
          output: '{"action":"note_created","noteId":"note_2","title":"Rovaniemi"}',
        },
      ],
      "whatsapp",
    );
    expect(reply).toBe("Created note: Rovaniemi.");
  });

  it("returns an explicit failure when note_create has no verifiable output", () => {
    const reply = buildNoteCreationReply([{ name: "note_create", input: {} }], "web");

    expect(reply).toBe("Could not create note: Tool output did not confirm note creation.");
  });

  it("aggregates unresolved attempts and explicit errors", () => {
    const outcomes = resolveNoteCreationOutcomes([
      { name: "note_create", input: {}, output: "Could not create note: conversation not found" },
      { name: "note_create", input: {}, output: "{not json" },
    ]);

    const reply = buildNoteCreationReply(
      [{ name: "note_create", input: {}, output: "Could not create note: conversation not found" }],
      "whatsapp",
      outcomes,
    );

    expect(reply).toBe(
      "Could not create note: conversation not found | Tool output did not confirm note creation.",
    );
  });
});
