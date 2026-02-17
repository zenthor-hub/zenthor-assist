import { describe, expect, it } from "vitest";

import { buildLoopToolPolicy } from "./loop-policy";

describe("buildLoopToolPolicy", () => {
  it("merges channel, skill, plugin, and agent policies", () => {
    const result = buildLoopToolPolicy({
      channel: "web",
      skills: [
        { config: { toolPolicy: { allow: ["get_current_time"], deny: ["delete_account"] } } },
      ],
      pluginPolicy: { allow: ["memory_search"] },
      agentPolicy: { allow: ["delegate_to_subagent"], deny: ["note_transform"] },
    });

    expect(result.policyMergeSource).toBe("channel+skills+plugin+agent");
    expect(result.mergedPolicy.deny).toContain("delete_account");
    expect(result.mergedPolicy.deny).toContain("note_transform");
    expect(result.noteAwarePolicy.allow).toContain("note_create");
    expect(result.noteAwarePolicy.allow).toContain("note_apply_transform");
  });

  it("keeps telegram policy unchanged while still allowing note tools on web", () => {
    const webResult = buildLoopToolPolicy({
      channel: "web",
      skills: [],
      pluginPolicy: { allow: ["calculate"] },
      agentPolicy: undefined,
    });
    const telegramResult = buildLoopToolPolicy({
      channel: "telegram",
      skills: [],
      pluginPolicy: { allow: ["calculate"] },
      agentPolicy: undefined,
    });

    expect(webResult.noteAwarePolicy.allow).toContain("note_create");
    expect(telegramResult.noteAwarePolicy.allow).toContain("calculate");
    expect(telegramResult.noteAwarePolicy.allow).not.toContain("note_create");
  });
});
