"use client";

import type { useUser } from "@clerk/nextjs";
import { useUser as useClerkUser, useReverification } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { logWebClientEvent } from "@/lib/observability/client";

type OAuthStrategy = "oauth_google" | "oauth_github" | "oauth_discord";

type ExternalAccount = NonNullable<ReturnType<typeof useUser>["user"]>["externalAccounts"][number];

export type { ExternalAccount };

type ConnectedAccountsState = ReturnType<typeof useConnectedAccountsState>;

const SUPPORTED_PROVIDERS = [
  {
    strategy: "oauth_google" as const,
    name: "Google",
    icon: "google",
  },
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function useConnectedAccountsState() {
  const { user, isLoaded } = useClerkUser();
  const [isConnecting, setIsConnecting] = useState<OAuthStrategy | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] = useState<ExternalAccount | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  return {
    user,
    isLoaded,
    isConnecting,
    setIsConnecting,
    accountToDisconnect,
    setAccountToDisconnect,
    isDisconnecting,
    setIsDisconnecting,
  };
}

function useConnectedAccountActions(
  state: ConnectedAccountsState,
  connectWithReverification: (strategy: OAuthStrategy) => Promise<ExternalAccount | undefined>,
  disconnectWithReverification: (account: ExternalAccount) => Promise<void>,
) {
  const handleConnect = async (strategy: OAuthStrategy) => {
    if (!state.user) return;
    state.setIsConnecting(strategy);
    try {
      const account = await connectWithReverification(strategy);
      if (account?.verification?.externalVerificationRedirectURL) {
        window.location.href = account.verification.externalVerificationRedirectURL.href;
        return;
      }
      state.setIsConnecting(null);
    } catch (error) {
      console.error("Failed to connect account:", error);
      logWebClientEvent({
        event: "web.settings.oauth.connect_failed",
        level: "error",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          strategy,
        },
      });
      const message = error instanceof Error ? error.message : "Failed to connect account";
      toast.error(message);
      state.setIsConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!state.accountToDisconnect) return;
    state.setIsDisconnecting(true);
    try {
      const provider = state.accountToDisconnect.provider;
      await disconnectWithReverification(state.accountToDisconnect);
      logWebClientEvent({
        event: "web.settings.oauth.disconnected",
        level: "info",
        payload: { provider },
      });
      toast.success("Account disconnected");
      state.setAccountToDisconnect(null);
    } catch (error) {
      console.error("Failed to disconnect account:", error);
      logWebClientEvent({
        event: "web.settings.oauth.disconnect_failed",
        level: "error",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          provider: state.accountToDisconnect?.provider,
        },
      });
      toast.error("Failed to disconnect account");
    } finally {
      state.setIsDisconnecting(false);
    }
  };

  return { handleConnect, handleDisconnect };
}

function useSyncExternalAccountEmails(
  user: ReturnType<typeof useConnectedAccountsState>["user"],
  isLoaded: boolean,
) {
  const syncedRef = useRef<Set<string>>(new Set());
  const createEmailWithReverification = useReverification(async (email: string) => {
    const emailAddress = await user?.createEmailAddress({ email });
    if (emailAddress) {
      await emailAddress.prepareVerification({ strategy: "email_code" });
    }
    return emailAddress;
  });

  useEffect(() => {
    if (!isLoaded || !user) return;

    const externalAccounts = user.externalAccounts ?? [];
    const existingEmails = new Set(user.emailAddresses.map((e) => e.emailAddress.toLowerCase()));

    for (const account of externalAccounts) {
      const email = account.emailAddress?.toLowerCase();
      if (!email) continue;
      if (existingEmails.has(email)) continue;
      if (syncedRef.current.has(email)) continue;

      syncedRef.current.add(email);

      createEmailWithReverification(account.emailAddress)
        .then((emailAddress) => {
          if (!emailAddress) return;
          toast.success(
            `Verification code sent to ${account.emailAddress} to link it to your account`,
          );
        })
        .catch((error) => {
          console.error("Failed to add external account email:", error);
          logWebClientEvent({
            event: "web.settings.oauth.sync_email_failed",
            level: "error",
            payload: {
              error: error instanceof Error ? error.message : String(error),
              provider: account.provider,
            },
          });
          syncedRef.current.delete(email);
        });
    }
  }, [createEmailWithReverification, isLoaded, user]);
}

export function useConnectedAccounts() {
  const state = useConnectedAccountsState();

  useSyncExternalAccountEmails(state.user, state.isLoaded);

  const connectWithReverification = useReverification(async (strategy: OAuthStrategy) => {
    const account = await state.user?.createExternalAccount({
      strategy,
      redirectUrl: `${window.location.origin}/settings`,
    });
    return account;
  });

  const disconnectWithReverification = useReverification(async (account: ExternalAccount) => {
    await account.destroy();
  });

  const { handleConnect, handleDisconnect } = useConnectedAccountActions(
    state,
    connectWithReverification,
    disconnectWithReverification,
  );

  const connectedAccounts = state.user?.externalAccounts ?? [];

  const getAccountForProvider = (strategy: OAuthStrategy) => {
    const providerName = strategy.replace("oauth_", "");
    return connectedAccounts.find((account) => account.provider === providerName);
  };

  return {
    isLoaded: state.isLoaded,
    connectedAccounts,
    supportedProviders: SUPPORTED_PROVIDERS,
    isConnecting: state.isConnecting,
    accountToDisconnect: state.accountToDisconnect,
    setAccountToDisconnect: state.setAccountToDisconnect,
    isDisconnecting: state.isDisconnecting,
    handleConnect,
    handleDisconnect,
    getAccountForProvider,
  };
}
