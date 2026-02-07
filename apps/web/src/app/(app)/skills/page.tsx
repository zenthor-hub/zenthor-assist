"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { SkillForm } from "@/components/skills/skill-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface SkillData {
  _id: Id<"skills">;
  name: string;
  description: string;
  enabled: boolean;
  config?: { systemPrompt?: string };
}

export default function SkillsPage() {
  const skills = useQuery(api.skills.list);
  const toggleSkill = useMutation(api.skills.toggle);
  const removeSkill = useMutation(api.skills.remove);

  const [formOpen, setFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillData | undefined>();

  if (skills === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  function handleEdit(skill: SkillData) {
    setEditingSkill(skill);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditingSkill(undefined);
    setFormOpen(true);
  }

  return (
    <PageWrapper
      title="Skills"
      actions={
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" />
          Add skill
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {skills.length === 0 ? (
          <div className="bg-muted/50 flex flex-col items-center justify-center gap-2 rounded-xl py-12">
            <Sparkles className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">No skills configured yet</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleAdd}>
              Create your first skill
            </Button>
          </div>
        ) : (
          <div className="divide-border divide-y rounded-xl border">
            {skills.map((skill) => (
              <div key={skill._id} className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="text-muted-foreground text-xs">{skill.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={async () => {
                      try {
                        await toggleSkill({ id: skill._id });
                      } catch {
                        toast.error("Failed to toggle skill");
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleEdit(skill as SkillData)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      try {
                        await removeSkill({ id: skill._id });
                        toast.success("Skill removed");
                      } catch {
                        toast.error("Failed to remove skill");
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SkillForm
        key={editingSkill?._id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        skill={editingSkill}
      />
    </PageWrapper>
  );
}
