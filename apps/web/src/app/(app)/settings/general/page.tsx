"use client";

import { Construction } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";

export default function SettingsGeneralPage() {
  return (
    <PageWrapper title="General" maxWidth="md">
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border py-16">
        <Construction className="text-muted-foreground size-8" />
        <p className="text-foreground text-sm font-medium">Under construction</p>
        <p className="text-muted-foreground text-xs">General settings will be available soon.</p>
      </div>
    </PageWrapper>
  );
}
