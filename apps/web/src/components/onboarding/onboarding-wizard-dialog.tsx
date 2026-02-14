"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { T } from "gt-next";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OnboardingStep =
  | "preferredName"
  | "agentName"
  | "timezone"
  | "communicationStyle"
  | "focusArea"
  | "boundaries";

interface OnboardingState {
  status: "pending" | "in_progress" | "completed";
  currentStep: OnboardingStep;
  answers?: {
    preferredName?: string;
    agentName?: string;
    timezone?: string;
    communicationStyle?: "concise" | "balanced" | "detailed";
    focusArea?: string;
    boundaries?: string;
  };
}

interface OnboardingWizardDialogProps {
  onboardingState: OnboardingState | null | undefined;
}

const stepOrder: OnboardingStep[] = [
  "preferredName",
  "agentName",
  "timezone",
  "communicationStyle",
  "focusArea",
  "boundaries",
];

const styleOptions = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
] as const;

const focusOptions = [
  { value: "productivity", label: "Productivity" },
  { value: "learning", label: "Learning" },
  { value: "wellbeing", label: "Wellbeing" },
] as const;

const timezoneOptions = [
  { value: "America/New_York", label: "America/New_York (UTC-4/5)" },
  { value: "America/Chicago", label: "America/Chicago (UTC-5/6)" },
  { value: "America/Denver", label: "America/Denver (UTC-6/7)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-7/8)" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (UTC-2/3)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (UTC-5/6)" },
  { value: "Europe/London", label: "United Kingdom (London)" },
  { value: "Europe/Berlin", label: "Germany (Berlin)" },
  { value: "Europe/Helsinki", label: "Europe/Helsinki (Finland)" },
  { value: "Europe/Paris", label: "Europe/Paris (UTC+1/2)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/11)" },
] as const;

function getStepMeta(step: OnboardingStep) {
  if (step === "preferredName") {
    return {
      title: "What should I call you?",
      description: "Tell me your preferred name for our chats.",
      skippable: false,
    };
  }
  if (step === "agentName") {
    return {
      title: "Name your assistant",
      description: "What would you like to call me? Default is Guilb.",
      skippable: true,
    };
  }
  if (step === "timezone") {
    return {
      title: "Your timezone",
      description: "This helps me schedule and suggest times correctly.",
      skippable: true,
    };
  }
  if (step === "communicationStyle") {
    return {
      title: "Response style",
      description: "Pick how you prefer my answers.",
      skippable: true,
    };
  }
  if (step === "focusArea") {
    return {
      title: "Main focus",
      description: "What should I prioritize helping with first?",
      skippable: true,
    };
  }
  return {
    title: "Boundaries",
    description: "Any constraints I should always respect?",
    skippable: true,
  };
}

export function OnboardingWizardDialog({ onboardingState }: OnboardingWizardDialogProps) {
  const submitStepAnswer = useMutation(api.onboarding.submitStepAnswer);
  const skipStep = useMutation(api.onboarding.skipStep);
  const [submitting, setSubmitting] = useState(false);

  const shouldOpen =
    onboardingState !== undefined &&
    onboardingState !== null &&
    onboardingState.status !== "completed";

  const currentStep: OnboardingStep = onboardingState?.currentStep ?? "preferredName";
  const currentIndex = Math.max(stepOrder.indexOf(currentStep), 0);
  const stepMeta = getStepMeta(currentStep);

  const [textValue, setTextValue] = useState("");
  const [styleValue, setStyleValue] = useState<"concise" | "balanced" | "detailed" | "">("");
  const [focusValue, setFocusValue] = useState("");

  const activeValue = useMemo(() => {
    if (currentStep === "preferredName") {
      return textValue || onboardingState?.answers?.preferredName || "";
    }
    if (currentStep === "agentName") {
      return textValue || onboardingState?.answers?.agentName || "";
    }
    if (currentStep === "timezone") {
      return textValue || onboardingState?.answers?.timezone || "";
    }
    if (currentStep === "communicationStyle") {
      return styleValue || onboardingState?.answers?.communicationStyle || "";
    }
    if (currentStep === "focusArea") {
      return focusValue || onboardingState?.answers?.focusArea || "";
    }
    return textValue || onboardingState?.answers?.boundaries || "";
  }, [currentStep, focusValue, onboardingState?.answers, styleValue, textValue]);

  async function handleContinue() {
    let value = "";
    if (currentStep === "communicationStyle") {
      value = styleValue;
    } else if (currentStep === "focusArea") {
      value = focusValue;
    } else {
      value = textValue.trim();
    }

    if (!value) {
      toast.error("Please fill this step before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      await submitStepAnswer({
        step: currentStep,
        input: value,
      });
      setTextValue("");
      setStyleValue("");
      setFocusValue("");
    } catch {
      toast.error("Could not save this step. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    try {
      await skipStep({ step: currentStep });
      setTextValue("");
      setStyleValue("");
      setFocusValue("");
    } catch {
      toast.error("Could not skip this step.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={shouldOpen} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <T>Getting started</T>
          </DialogTitle>
          <DialogDescription>{stepMeta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-muted-foreground text-xs">
            <T>Step</T> {currentIndex + 1}/{stepOrder.length}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{stepMeta.title}</p>

            {(currentStep === "preferredName" || currentStep === "agentName") && (
              <Input
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                placeholder={currentStep === "preferredName" ? "How should I call you?" : "Guilb"}
                disabled={submitting}
              />
            )}

            {currentStep === "timezone" && (
              <Select
                value={textValue || onboardingState?.answers?.timezone || ""}
                onValueChange={setTextValue}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="America/Sao_Paulo" />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {currentStep === "communicationStyle" && (
              <div className="grid grid-cols-3 gap-2">
                {styleOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={styleValue === option.value ? "default" : "outline"}
                    className={cn("justify-center", submitting && "pointer-events-none")}
                    onClick={() => setStyleValue(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}

            {currentStep === "focusArea" && (
              <div className="grid grid-cols-3 gap-2">
                {focusOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={focusValue === option.value ? "default" : "outline"}
                    className={cn("justify-center", submitting && "pointer-events-none")}
                    onClick={() => setFocusValue(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}

            {currentStep === "boundaries" && (
              <Textarea
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                placeholder="Examples: ask before financial actions, keep responses brief"
                disabled={submitting}
              />
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {stepMeta.skippable ? (
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={submitting}>
              <T>Skip</T>
            </Button>
          ) : (
            <div />
          )}
          <Button type="button" onClick={handleContinue} disabled={submitting || !activeValue}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <T>Continue</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
