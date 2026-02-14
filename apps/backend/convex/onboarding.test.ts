import { describe, expect, it } from "vitest";

import { applyOnboardingAnswer, getOnboardingPrompt } from "./onboarding";

describe("onboarding prompts", () => {
  it("returns preferredName prompt without buttons", () => {
    const prompt = getOnboardingPrompt("preferredName");

    expect(prompt.question).toContain("call you");
    expect(prompt.buttons).toBeUndefined();
  });

  it("returns agentName prompt without buttons", () => {
    const prompt = getOnboardingPrompt("agentName");

    expect(prompt.question).toContain("call me");
    expect(prompt.buttons).toBeUndefined();
  });

  it("returns communication style prompt with quick-reply buttons", () => {
    const prompt = getOnboardingPrompt("communicationStyle");

    expect(prompt.question).toContain("prefer my responses");
    expect(prompt.buttons).toEqual([
      { id: "concise", title: "Concise" },
      { id: "balanced", title: "Balanced" },
      { id: "detailed", title: "Detailed" },
    ]);
  });
});

describe("applyOnboardingAnswer", () => {
  it("advances from preferredName to agentName", () => {
    const result = applyOnboardingAnswer({
      step: "preferredName",
      input: "  Gabi  ",
      answers: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answers.preferredName).toBe("Gabi");
    expect(result.nextStep).toBe("agentName");
    expect(result.completed).toBe(false);
  });

  it("advances from agentName to timezone", () => {
    const result = applyOnboardingAnswer({
      step: "agentName",
      input: "  Jarvis  ",
      answers: { preferredName: "Gabi" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answers.agentName).toBe("Jarvis");
    expect(result.nextStep).toBe("timezone");
    expect(result.completed).toBe(false);
  });

  it("keeps user on communicationStyle when value is invalid", () => {
    const result = applyOnboardingAnswer({
      step: "communicationStyle",
      input: "super short",
      answers: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.content).toContain("Please pick one");
    expect(result.buttons?.map((button) => button.id)).toEqual(["concise", "balanced", "detailed"]);
  });

  it("accepts communicationStyle button id values case-insensitively", () => {
    const result = applyOnboardingAnswer({
      step: "communicationStyle",
      input: "BALANCED",
      answers: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answers.communicationStyle).toBe("balanced");
    expect(result.nextStep).toBe("focusArea");
  });

  it("maps focusArea quick-reply payloads to normalized values", () => {
    const result = applyOnboardingAnswer({
      step: "focusArea",
      input: "learning",
      answers: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answers.focusArea).toBe("learning");
    expect(result.nextStep).toBe("boundaries");
    expect(result.completed).toBe(false);
  });

  it("marks onboarding complete at final boundaries step", () => {
    const result = applyOnboardingAnswer({
      step: "boundaries",
      input: "Always ask before creating transactions",
      answers: {
        preferredName: "Ana",
        agentName: "Guilb",
        timezone: "America/Sao_Paulo",
        communicationStyle: "concise",
        focusArea: "productivity",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.completed).toBe(true);
    expect(result.nextStep).toBeNull();
    expect(result.answers.boundaries).toBe("Always ask before creating transactions");
  });

  it("walks through full onboarding flow from start to completion", () => {
    let answers = {};

    // Step 1: preferredName
    const step1 = applyOnboardingAnswer({ step: "preferredName", input: "Ana", answers });
    expect(step1.ok).toBe(true);
    if (!step1.ok) return;
    answers = step1.answers;
    expect(step1.nextStep).toBe("agentName");

    // Step 2: agentName
    const step2 = applyOnboardingAnswer({ step: "agentName", input: "Guilb", answers });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    answers = step2.answers;
    expect(step2.nextStep).toBe("timezone");

    // Step 3: timezone
    const step3 = applyOnboardingAnswer({ step: "timezone", input: "UTC-3", answers });
    expect(step3.ok).toBe(true);
    if (!step3.ok) return;
    answers = step3.answers;
    expect(step3.nextStep).toBe("communicationStyle");

    // Step 4: communicationStyle
    const step4 = applyOnboardingAnswer({
      step: "communicationStyle",
      input: "detailed",
      answers,
    });
    expect(step4.ok).toBe(true);
    if (!step4.ok) return;
    answers = step4.answers;
    expect(step4.nextStep).toBe("focusArea");

    // Step 5: focusArea
    const step5 = applyOnboardingAnswer({ step: "focusArea", input: "productivity", answers });
    expect(step5.ok).toBe(true);
    if (!step5.ok) return;
    answers = step5.answers;
    expect(step5.nextStep).toBe("boundaries");

    // Step 6: boundaries (final)
    const step6 = applyOnboardingAnswer({
      step: "boundaries",
      input: "No finance without confirmation",
      answers,
    });
    expect(step6.ok).toBe(true);
    if (!step6.ok) return;

    expect(step6.completed).toBe(true);
    expect(step6.nextStep).toBeNull();
    expect(step6.answers).toEqual({
      preferredName: "Ana",
      agentName: "Guilb",
      timezone: "UTC-3",
      communicationStyle: "detailed",
      focusArea: "productivity",
      boundaries: "No finance without confirmation",
    });
  });
});
