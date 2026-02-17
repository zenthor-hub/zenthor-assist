import { describe, expect, it } from "vitest";

import { composeAssistantResponse } from "./generation-response";

describe("composeAssistantResponse", () => {
  it("keeps note creation result for WhatsApp responses", () => {
    const result = composeAssistantResponse({
      channel: "whatsapp",
      toolCalls: [
        {
          name: "note_create",
          input: { title: "Trip" },
          output: '{"action":"note_created","noteId":"note_1","title":"Weekend Trip"}',
        },
      ],
      assistantContent: "",
    });

    expect(result.content).toBe("Created note: Weekend Trip.");
    expect(result.noteCreationOutcomes.successes).toHaveLength(1);
    expect(result.noteCreationOutcomes.failures).toHaveLength(0);
  });

  it("adds WhatsApp metadata when preferences request it", () => {
    const result = composeAssistantResponse({
      channel: "whatsapp",
      toolCalls: [
        {
          name: "calculate",
          input: { expression: "2+2" },
          output: "4",
        },
      ],
      assistantContent: "Here is it: *4*",
      modelUsed: "xai/grok-4-1-fast-reasoning",
      preferences: {
        showModelInfo: true,
        showToolDetails: true,
      },
    });

    expect(result.content).toContain("Here is it: *4*");
    expect(result.content).toContain("Model:");
    expect(result.content).toContain("Tools: calculate");
    expect(result.content).toContain("\n\n_");
  });
});
