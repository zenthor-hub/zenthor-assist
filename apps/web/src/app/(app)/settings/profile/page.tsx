"use client";

import { T } from "gt-next";

import { PageWrapper } from "@/components/page-wrapper";
import { ProfileSection } from "@/components/settings/profile-section";

export default function SettingsProfilePage() {
  return (
    <PageWrapper title={<T>Profile</T>} maxWidth="md">
      <ProfileSection />
    </PageWrapper>
  );
}
