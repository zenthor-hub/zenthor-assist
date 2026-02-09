"use client";

import { useUser } from "@clerk/nextjs";

import { ConnectedAccountsSection } from "./connected-accounts-section";
import { EmailAddressesSection } from "./email-addresses-section";
import { ProfileInfoSection } from "./profile-info-section";
import { useConnectedAccounts } from "./use-connected-accounts";
import { useEmailAddresses } from "./use-email-addresses";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Profile Info */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted size-12 animate-pulse rounded-full" />
            <div className="bg-muted h-4 w-28 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-8 w-16 animate-pulse rounded" />
        </div>
      </div>

      {/* Email Addresses */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
          <div className="bg-muted h-8 w-14 animate-pulse rounded" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="bg-muted size-8 animate-pulse rounded-full" />
            <div className="flex items-center gap-2">
              <div className="bg-muted h-3.5 w-36 animate-pulse rounded" />
              <div className="bg-muted h-4 w-14 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Connected Accounts */}
      <div className="flex flex-col gap-3">
        <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="bg-muted size-8 animate-pulse rounded-full" />
          <div className="bg-muted h-3.5 w-20 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}

export function ProfileSection() {
  const { user, isLoaded } = useUser();
  const emailState = useEmailAddresses();
  const connectedAccountsState = useConnectedAccounts();

  if (!isLoaded || !emailState.isLoaded || !connectedAccountsState.isLoaded) {
    return <ProfileSkeleton />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileInfoSection user={user} />
      <EmailAddressesSection user={user} emailState={emailState} />
      <ConnectedAccountsSection connectedAccountsState={connectedAccountsState} />
    </div>
  );
}
