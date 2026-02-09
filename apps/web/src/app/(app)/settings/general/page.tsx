"use client";

import { PageWrapper } from "@/components/page-wrapper";
import { ChatDisplayPreferences } from "@/components/settings/chat-display-preferences";

export default function SettingsGeneralPage() {
  return (
    <PageWrapper title="General" maxWidth="md">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Chat Display
          </h2>
          <ChatDisplayPreferences />
        </div>
      </div>
    </PageWrapper>
  );
}
