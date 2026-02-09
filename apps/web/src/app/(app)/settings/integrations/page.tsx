"use client";

import { PageWrapper } from "@/components/page-wrapper";
import { PhoneVerification } from "@/components/settings/phone-verification";
import { TodoistIntegrationSection } from "@/components/settings/todoist-integration-section";

export default function SettingsIntegrationsPage() {
  return (
    <PageWrapper title="Integrations" maxWidth="md">
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            WhatsApp
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Link your WhatsApp number to access conversations from the web.
          </p>
          <div className="mt-4">
            <PhoneVerification />
          </div>
        </section>

        <section>
          <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Todoist
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Connect Todoist so the assistant can capture, plan, and complete tasks.
          </p>
          <div className="mt-4">
            <TodoistIntegrationSection />
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
