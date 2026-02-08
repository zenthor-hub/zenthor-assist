"use client";

import { useUser } from "@clerk/nextjs";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { ConnectedAccountsSection } from "./connected-accounts-section";
import { EmailAddressesSection } from "./email-addresses-section";
import { ProfileInfoSection } from "./profile-info-section";
import { useConnectedAccounts } from "./use-connected-accounts";
import { useEmailAddresses } from "./use-email-addresses";

function ProfileSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Manage your profile information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Info Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-muted size-16 animate-pulse rounded-full" />
            <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-9 w-20 animate-pulse rounded" />
        </div>

        <Separator />

        {/* Email Addresses Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="bg-muted h-4 w-28 animate-pulse rounded" />
              <div className="bg-muted h-3 w-40 animate-pulse rounded" />
            </div>
            <div className="bg-muted h-9 w-16 animate-pulse rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="border-border flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-muted size-10 animate-pulse rounded-full" />
                  <div className="flex items-center gap-2">
                    <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                    <div className="bg-muted h-5 w-16 animate-pulse rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Connected Accounts Section */}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="bg-muted h-4 w-36 animate-pulse rounded" />
            <div className="bg-muted h-3 w-56 animate-pulse rounded" />
          </div>
          <div className="space-y-3">
            <div className="border-border flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="bg-muted size-10 animate-pulse rounded-full" />
                <div className="bg-muted h-4 w-20 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-9 w-24 animate-pulse rounded" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Manage your profile information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ProfileInfoSection user={user} />
        <Separator />
        <EmailAddressesSection user={user} emailState={emailState} />
        <Separator />
        <ConnectedAccountsSection connectedAccountsState={connectedAccountsState} />
      </CardContent>
    </Card>
  );
}
