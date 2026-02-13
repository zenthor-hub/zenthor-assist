"use client";

import { T } from "gt-next";

import { PageWrapper } from "@/components/page-wrapper";
import { PhoneVerification } from "@/components/settings/phone-verification";
import { TodoistIntegrationSection } from "@/components/settings/todoist-integration-section";

export default function SettingsIntegrationsPage() {
  return (
    <PageWrapper title={<T>Integrations</T>} maxWidth="md">
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            <T>WhatsApp</T>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            <T>Link your WhatsApp number to access conversations from the web.</T>
          </p>
          <div className="mt-4">
            <PhoneVerification />
          </div>
        </section>

        <section>
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            <T>Todoist</T>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            <T>Connect Todoist so the assistant can capture, plan, and complete tasks.</T>
          </p>
          <div className="mt-4">
            <TodoistIntegrationSection />
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
