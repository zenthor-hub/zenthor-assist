import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authMutation, authQuery, serviceMutation, serviceQuery } from "./auth";

const ONBOARDING_TITLE = "Getting started";

const stepValidator = v.union(
  v.literal("preferredName"),
  v.literal("agentName"),
  v.literal("timezone"),
  v.literal("communicationStyle"),
  v.literal("focusArea"),
  v.literal("boundaries"),
);

const communicationStyleValidator = v.union(
  v.literal("concise"),
  v.literal("balanced"),
  v.literal("detailed"),
);

const onboardingDoc = v.object({
  _id: v.id("userOnboarding"),
  _creationTime: v.number(),
  userId: v.id("users"),
  status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
  currentStep: stepValidator,
  lastPromptedStep: v.optional(stepValidator),
  onboardingConversationId: v.optional(v.id("conversations")),
  answers: v.optional(
    v.object({
      preferredName: v.optional(v.string()),
      agentName: v.optional(v.string()),
      timezone: v.optional(v.string()),
      communicationStyle: v.optional(communicationStyleValidator),
      focusArea: v.optional(v.string()),
      boundaries: v.optional(v.string()),
    }),
  ),
  completedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

const stepOrder = [
  "preferredName",
  "agentName",
  "timezone",
  "communicationStyle",
  "focusArea",
  "boundaries",
] as const;

type OnboardingStep = (typeof stepOrder)[number];

const skippableSteps: OnboardingStep[] = [
  "agentName",
  "timezone",
  "communicationStyle",
  "focusArea",
  "boundaries",
];

type StyleOption = "concise" | "balanced" | "detailed";

export interface OnboardingAnswers {
  preferredName?: string;
  agentName?: string;
  timezone?: string;
  communicationStyle?: StyleOption;
  focusArea?: string;
  boundaries?: string;
}

const styleButtons = [
  { id: "concise", title: "Concise" },
  { id: "balanced", title: "Balanced" },
  { id: "detailed", title: "Detailed" },
] as const;

const focusButtons = [
  { id: "productivity", title: "Productivity" },
  { id: "learning", title: "Learning" },
  { id: "wellbeing", title: "Wellbeing" },
] as const;

const choiceLabelById: Record<string, string> = {
  concise: "concise",
  balanced: "balanced",
  detailed: "detailed",
  productivity: "productivity",
  learning: "learning",
  wellbeing: "wellbeing",
};

function nextStep(current: OnboardingStep): OnboardingStep | null {
  const currentIndex = stepOrder.indexOf(current);
  if (currentIndex < 0 || currentIndex >= stepOrder.length - 1) {
    return null;
  }
  return stepOrder[currentIndex + 1] ?? null;
}

export function getOnboardingPrompt(step: OnboardingStep): {
  question: string;
  buttons?: Array<{ id: string; title: string }>;
} {
  if (step === "preferredName") {
    return {
      question: "Hey there! Great to meet you. What should I call you in our chats?",
    };
  }

  if (step === "agentName") {
    return {
      question:
        "Cool! Now, what would you like to call me? My default name is Guilb, but you can pick anything.",
    };
  }

  if (step === "timezone") {
    return {
      question: "Nice. What timezone are you in? (example: America/Sao_Paulo or UTC-3)",
    };
  }

  if (step === "communicationStyle") {
    return {
      question: "How do you prefer my responses?",
      buttons: [...styleButtons],
    };
  }

  if (step === "focusArea") {
    return {
      question: "What should I prioritize helping with first?",
      buttons: [...focusButtons],
    };
  }

  return {
    question:
      "Any boundaries or preferences I should always respect? (For example: no finance actions without confirmation)",
  };
}

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function normalizeChoice(input: string): string {
  return normalizeText(input).toLowerCase();
}

function parseStyle(value: string): StyleOption | null {
  const normalized = normalizeChoice(value);
  if (normalized === "concise") return "concise";
  if (normalized === "balanced") return "balanced";
  if (normalized === "detailed") return "detailed";
  return null;
}

function parseFocus(value: string): string {
  const normalized = normalizeChoice(value);
  if (normalized in choiceLabelById) {
    return choiceLabelById[normalized] ?? normalized;
  }
  return normalizeText(value);
}

export function applyOnboardingAnswer(params: {
  step: OnboardingStep;
  input: string;
  answers?: OnboardingAnswers;
}):
  | {
      ok: true;
      answers: OnboardingAnswers;
      nextStep: OnboardingStep | null;
      completed: boolean;
    }
  | {
      ok: false;
      content: string;
      buttons?: Array<{ id: string; title: string }>;
    } {
  const nextAnswers: OnboardingAnswers = { ...params.answers };

  if (params.step === "preferredName") {
    nextAnswers.preferredName = normalizeText(params.input);
  } else if (params.step === "agentName") {
    nextAnswers.agentName = normalizeText(params.input);
  } else if (params.step === "timezone") {
    nextAnswers.timezone = normalizeText(params.input);
  } else if (params.step === "communicationStyle") {
    const parsed = parseStyle(params.input);
    if (!parsed) {
      return {
        ok: false,
        content: "Please pick one: concise, balanced, or detailed.",
        buttons: [...styleButtons],
      };
    }
    nextAnswers.communicationStyle = parsed;
  } else if (params.step === "focusArea") {
    nextAnswers.focusArea = parseFocus(params.input);
  } else {
    nextAnswers.boundaries = normalizeText(params.input);
  }

  const upcomingStep = nextStep(params.step);
  return {
    ok: true,
    answers: nextAnswers,
    nextStep: upcomingStep,
    completed: upcomingStep === null,
  };
}

function defaultAnswerForStep(step: OnboardingStep): Partial<OnboardingAnswers> {
  if (step === "agentName") {
    return { agentName: "Guilb" };
  }
  if (step === "communicationStyle") {
    return { communicationStyle: "balanced" };
  }
  return {};
}

async function getOrCreateState(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"userOnboarding">> {
  const existing = await ctx.db
    .query("userOnboarding")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (existing) {
    return existing;
  }

  const id = await ctx.db.insert("userOnboarding", {
    userId,
    status: "pending",
    currentStep: "preferredName",
    updatedAt: Date.now(),
  });

  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to create onboarding state");
  }
  return created;
}

export const getMyState = authQuery({
  args: {},
  returns: v.union(onboardingDoc, v.null()),
  handler: async (ctx) => {
    return await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
      .unique();
  },
});

export const getByUserId = serviceQuery({
  args: { userId: v.id("users") },
  returns: v.union(onboardingDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const ensureConversation = authMutation({
  args: {},
  returns: v.id("conversations"),
  handler: async (ctx) => {
    const state = await getOrCreateState(ctx, ctx.auth.user._id);
    const now = Date.now();
    let conversationId: Id<"conversations"> | null = null;
    let shouldPatchConversationRef = false;

    if (state.onboardingConversationId) {
      const existingConversation = await ctx.db.get(state.onboardingConversationId);
      if (existingConversation && existingConversation.status === "active") {
        conversationId = existingConversation._id;
      }
    }

    if (!conversationId) {
      const userConversations = await ctx.db
        .query("conversations")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.auth.user._id))
        .filter((q) => q.eq(q.field("channel"), "web"))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();

      const onboardingConversation = userConversations.find(
        (conversation) => conversation.title === ONBOARDING_TITLE,
      );

      if (onboardingConversation) {
        conversationId = onboardingConversation._id;
        if (state.onboardingConversationId !== onboardingConversation._id) {
          shouldPatchConversationRef = true;
        }
      }
    }

    if (!conversationId) {
      conversationId = await ctx.db.insert("conversations", {
        userId: ctx.auth.user._id,
        channel: "web",
        status: "active",
        title: ONBOARDING_TITLE,
      });
      shouldPatchConversationRef = true;
    }

    if (state.onboardingConversationId !== conversationId) {
      shouldPatchConversationRef = true;
    }

    if (shouldPatchConversationRef) {
      await ctx.db.patch(state._id, {
        onboardingConversationId: conversationId,
        updatedAt: now,
      });
    }

    const hasAnyMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .first();

    if (!hasAnyMessages) {
      const firstPrompt = getOnboardingPrompt("preferredName");
      await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: firstPrompt.question,
        channel: "web",
        status: "sent",
      });

      await ctx.db.patch(state._id, {
        status: "in_progress",
        currentStep: "preferredName",
        lastPromptedStep: "preferredName",
        updatedAt: now,
      });
    }

    return conversationId;
  },
});

export const progressFromMessage = serviceMutation({
  args: {
    userId: v.id("users"),
    input: v.string(),
  },
  returns: v.union(
    v.object({
      content: v.string(),
      buttons: v.optional(v.array(v.object({ id: v.string(), title: v.string() }))),
      completed: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const state = await getOrCreateState(ctx, args.userId);
    if (state.status === "completed") {
      return null;
    }

    const current = state.currentStep as OnboardingStep;
    const now = Date.now();

    if (state.lastPromptedStep !== current) {
      const prompt = getOnboardingPrompt(current);
      await ctx.db.patch(state._id, {
        status: "in_progress",
        lastPromptedStep: current,
        updatedAt: now,
      });
      return {
        content: prompt.question,
        buttons: prompt.buttons,
        completed: false,
      };
    }

    const normalized = normalizeText(args.input);
    if (!normalized) {
      const prompt = getOnboardingPrompt(current);
      return {
        content: prompt.question,
        buttons: prompt.buttons,
        completed: false,
      };
    }

    const applied = applyOnboardingAnswer({
      step: current,
      input: normalized,
      answers: state.answers,
    });
    if (!applied.ok) {
      return {
        content: applied.content,
        buttons: applied.buttons,
        completed: false,
      };
    }

    if (applied.completed) {
      await ctx.db.patch(state._id, {
        status: "completed",
        answers: applied.answers,
        lastPromptedStep: undefined,
        completedAt: now,
        updatedAt: now,
      });

      if (applied.answers.preferredName) {
        await ctx.db.patch(args.userId, {
          name: applied.answers.preferredName,
          updatedAt: now,
        });
      }

      const chosenName = applied.answers.agentName ?? "Guilb";
      return {
        content: `Awesome. Onboarding is complete. I'm ${chosenName}, and I'll use these preferences from now on.`,
        completed: true,
      };
    }

    const upcomingStep = applied.nextStep;
    if (!upcomingStep) {
      return null;
    }

    const nextPrompt = getOnboardingPrompt(upcomingStep);
    await ctx.db.patch(state._id, {
      status: "in_progress",
      currentStep: upcomingStep,
      lastPromptedStep: upcomingStep,
      answers: applied.answers,
      updatedAt: now,
    });

    return {
      content: nextPrompt.question,
      buttons: nextPrompt.buttons,
      completed: false,
    };
  },
});

export const submitStepAnswer = authMutation({
  args: {
    step: stepValidator,
    input: v.string(),
  },
  returns: v.object({
    completed: v.boolean(),
    currentStep: v.optional(stepValidator),
  }),
  handler: async (ctx, args) => {
    const state = await getOrCreateState(ctx, ctx.auth.user._id);
    if (state.status === "completed") {
      return { completed: true };
    }

    if (state.currentStep !== args.step) {
      return { completed: false, currentStep: state.currentStep };
    }

    const normalized = normalizeText(args.input);
    const applied = applyOnboardingAnswer({
      step: state.currentStep,
      input: normalized,
      answers: state.answers,
    });

    if (!applied.ok) {
      throw new Error(applied.content);
    }

    const now = Date.now();
    if (applied.completed) {
      await ctx.db.patch(state._id, {
        status: "completed",
        answers: applied.answers,
        lastPromptedStep: undefined,
        completedAt: now,
        updatedAt: now,
      });
      if (applied.answers.preferredName) {
        await ctx.db.patch(ctx.auth.user._id, {
          name: applied.answers.preferredName,
          updatedAt: now,
        });
      }
      return { completed: true };
    }

    const next = applied.nextStep;
    if (!next) {
      return { completed: false, currentStep: state.currentStep };
    }

    await ctx.db.patch(state._id, {
      status: "in_progress",
      currentStep: next,
      answers: applied.answers,
      updatedAt: now,
    });
    return { completed: false, currentStep: next };
  },
});

export const skipStep = authMutation({
  args: { step: stepValidator },
  returns: v.object({
    completed: v.boolean(),
    currentStep: v.optional(stepValidator),
  }),
  handler: async (ctx, args) => {
    const state = await getOrCreateState(ctx, ctx.auth.user._id);
    if (state.status === "completed") {
      return { completed: true };
    }

    if (state.currentStep !== args.step) {
      return { completed: false, currentStep: state.currentStep };
    }

    if (!skippableSteps.includes(args.step)) {
      return { completed: false, currentStep: state.currentStep };
    }

    const now = Date.now();
    const nextAnswers = {
      ...state.answers,
      ...defaultAnswerForStep(args.step),
    };

    const next = nextStep(args.step);
    if (!next) {
      await ctx.db.patch(state._id, {
        status: "completed",
        answers: nextAnswers,
        lastPromptedStep: undefined,
        completedAt: now,
        updatedAt: now,
      });
      return { completed: true };
    }

    await ctx.db.patch(state._id, {
      status: "in_progress",
      currentStep: next,
      answers: nextAnswers,
      updatedAt: now,
    });
    return { completed: false, currentStep: next };
  },
});
