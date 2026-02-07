"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
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
        toast.success("Skill updated");
      } else {
        await createSkill({ name, description, enabled, config });
        toast.success("Skill created");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? "Failed to update skill" : "Failed to create skill");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit skill" : "Add skill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code reviewer"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-description">Description</Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this skill does..."
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-prompt">System prompt</Label>
            <Textarea
              id="skill-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Instructions appended to the system prompt..."
              rows={4}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="skill-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="skill-enabled">Enabled</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
