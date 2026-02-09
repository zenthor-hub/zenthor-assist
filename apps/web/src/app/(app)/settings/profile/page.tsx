"use client";

import { PageWrapper } from "@/components/page-wrapper";
import { ProfileSection } from "@/components/settings/profile-section";

export default function SettingsProfilePage() {
  return (
    <PageWrapper title="Profile" maxWidth="md">
      <ProfileSection />
    </PageWrapper>
  );
}
