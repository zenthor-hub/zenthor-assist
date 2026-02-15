"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
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
  const t = useGT();
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const skills = useQuery(api.skills.list, isAdmin ? {} : "skip");
  const toggleSkill = useMutation(api.skills.toggle);
  const removeSkill = useMutation(api.skills.remove);
  const seedRecommended = useMutation(api.skills.seedRecommended);
  const claimLegacy = useMutation(api.skills.claimLegacy);

  const [formOpen, setFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillData | undefined>();

  if (me === undefined || (isAdmin && skills === undefined)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <PageWrapper title={<T>Skills</T>}>
        <div className="text-muted-foreground rounded-xl border p-6">
          <T>You do not have permission to manage skills.</T>
        </div>
      </PageWrapper>
    );
  }

  const adminSkills = (skills as SkillData[] | undefined) ?? [];

  function handleEdit(skill: SkillData) {
    setEditingSkill(skill);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditingSkill(undefined);
    setFormOpen(true);
  }

  async function handleSeedRecommended() {
    try {
      const result = await seedRecommended({});
      toast.success(
        t("Recommended skills ready: {created} created, {existing} already existed.")
          .replace("{created}", String(result.created))
          .replace("{existing}", String(result.existing)),
      );
    } catch {
      toast.error(t("Failed to add recommended skills"));
    }
  }

  async function handleClaimLegacy() {
    try {
      const result = await claimLegacy({});
      if (result.adopted === 0) {
        toast.message(t("No legacy skills found to claim"));
      } else {
        toast.success(
          t("Claimed {count} legacy skills").replace("{count}", String(result.adopted)),
        );
      }
    } catch {
      toast.error(t("Failed to claim legacy skills"));
    }
  }

  return (
    <PageWrapper
      title={<T>Skills</T>}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleClaimLegacy}>
            <T>Claim legacy</T>
          </Button>
          <Button size="sm" variant="outline" onClick={handleSeedRecommended}>
            <T>Add recommended</T>
          </Button>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="size-4" />
            <T>Add skill</T>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {adminSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border py-12">
            <Sparkles className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">
              <T>No skills configured yet</T>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSeedRecommended}>
                <T>Add recommended skills</T>
              </Button>
              <Button variant="outline" size="sm" onClick={handleAdd}>
                <T>Create your first skill</T>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-border divide-y rounded-lg border">
            {adminSkills.map((skill) => (
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
                        toast.error(t("Failed to toggle skill"));
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
                        toast.success(t("Skill removed"));
                      } catch {
                        toast.error(t("Failed to remove skill"));
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
