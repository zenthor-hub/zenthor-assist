"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ChatDisplayPreferences() {
  const preferences = useQuery(api.userPreferences.get);
  const upsert = useMutation(api.userPreferences.upsert);

  const isLoading = preferences === undefined;

  async function handleToggle(field: "showModelInfo" | "showToolDetails", value: boolean) {
    try {
      await upsert({ [field]: value });
    } catch {
      toast.error("Failed to update preference");
    }
  }

  return (
    <div className="divide-border divide-y rounded-lg border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <Label className="text-xs font-medium">Show AI model</Label>
          <p className="text-muted-foreground text-xs">
            Display which model generated each response
          </p>
        </div>
        <Switch
          size="sm"
          disabled={isLoading}
          checked={preferences?.showModelInfo ?? false}
          onCheckedChange={(v) => handleToggle("showModelInfo", v)}
        />
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <Label className="text-xs font-medium">Show tool details</Label>
          <p className="text-muted-foreground text-xs">Show tool call summaries in messages</p>
        </div>
        <Switch
          size="sm"
          disabled={isLoading}
          checked={preferences?.showToolDetails ?? false}
          onCheckedChange={(v) => handleToggle("showToolDetails", v)}
        />
      </div>
    </div>
  );
}
