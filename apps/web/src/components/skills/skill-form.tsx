"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { T, useGT } from "gt-next";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface SkillData {
  _id: Id<"skills">;
  name: string;
  description: string;
  enabled: boolean;
  config?: { systemPrompt?: string };
}

interface SkillFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: SkillData;
}

export function SkillForm({ open, onOpenChange, skill }: SkillFormProps) {
  const createSkill = useMutation(api.skills.create);
  const updateSkill = useMutation(api.skills.update);
  const t = useGT();

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(skill?.config?.systemPrompt ?? "");
  const [enabled, setEnabled] = useState(skill?.enabled ?? true);

  const isEditing = !!skill;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const config = systemPrompt ? { systemPrompt } : undefined;

    try {
      if (isEditing) {
        await updateSkill({ id: skill._id, name, description, enabled, config });
        toast.success(t("Skill updated"));
      } else {
        await createSkill({ name, description, enabled, config });
        toast.success(t("Skill created"));
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? t("Failed to update skill") : t("Failed to create skill"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? <T>Edit skill</T> : <T>Add skill</T>}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-name">
              <T>Name</T>
            </Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("e.g. Code reviewer")}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-description">
              <T>Description</T>
            </Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("What this skill does...")}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-prompt">
              <T>System prompt</T>
            </Label>
            <Textarea
              id="skill-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t("Instructions appended to the system prompt...")}
              rows={4}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="skill-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="skill-enabled">
              <T>Enabled</T>
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <T>Cancel</T>
            </Button>
            <Button type="submit">{isEditing ? <T>Save</T> : <T>Create</T>}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
