"use client";

import { Link2, Link2Off, Loader2, MoreHorizontal } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type {
  ExternalAccount,
  SupportedProvider,
  useConnectedAccounts,
} from "./use-connected-accounts";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function getProviderIcon(icon: string, className?: string) {
  switch (icon) {
    case "google":
      return <GoogleIcon className={className} />;
    default:
      return <Link2 className={className} />;
  }
}

function ConnectedAccountRow({
  provider,
  account,
  isConnecting,
  onConnect,
  onDisconnect,
}: {
  provider: SupportedProvider;
  account: ExternalAccount | undefined;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = !!account;
  const isVerified = account?.verification?.status === "verified" || !!account?.emailAddress;

  return (
    <div className="border-border flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="bg-muted flex size-10 items-center justify-center rounded-full">
          {getProviderIcon(provider.icon, "size-5")}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{provider.name}</span>
            {isConnected &&
              (isVerified ? (
                <Badge
                  variant="outline"
                  className="border-green-500/30 bg-green-500/10 text-xs text-green-600 dark:text-green-400"
                >
                  Connected
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
                >
                  Pending
                </Badge>
              ))}
          </div>
          {isConnected && account.emailAddress && (
            <p className="text-muted-foreground text-xs">{account.emailAddress}</p>
          )}
        </div>
      </div>

      {isConnected ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isVerified && account.verification?.externalVerificationRedirectURL && (
              <DropdownMenuItem asChild>
                <a href={account.verification.externalVerificationRedirectURL.href}>Reverify</a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDisconnect}
              className="text-destructive focus:text-destructive"
            >
              <Link2Off className="mr-2 size-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" size="sm" onClick={onConnect} disabled={isConnecting}>
          {isConnecting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Link2 className="size-4" />
          )}
          Connect
        </Button>
      )}
    </div>
  );
}

function DisconnectAccountDialog({
  account,
  isDisconnecting,
  onDisconnect,
  onClose,
}: {
  account: ExternalAccount | null;
  isDisconnecting: boolean;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const providerName = account?.provider
    ? account.provider.charAt(0).toUpperCase() + account.provider.slice(1)
    : "";

  return (
    <AlertDialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {providerName}</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to disconnect your {providerName} account
            {account?.emailAddress && (
              <span className="font-medium"> ({account.emailAddress})</span>
            )}
            ? You can reconnect it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDisconnecting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              onDisconnect();
            }}
            disabled={isDisconnecting}
          >
            {isDisconnecting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ConnectedAccountsSection({
  connectedAccountsState,
}: {
  connectedAccountsState: ReturnType<typeof useConnectedAccounts>;
}) {
  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Connected Accounts</h3>
          <p className="text-muted-foreground text-sm">
            Connect external accounts for easier sign-in
          </p>
        </div>
        <div className="space-y-3">
          {connectedAccountsState.supportedProviders.map((provider) => {
            const account = connectedAccountsState.getAccountForProvider(provider.strategy);
            return (
              <ConnectedAccountRow
                key={provider.strategy}
                provider={provider}
                account={account}
                isConnecting={connectedAccountsState.isConnecting === provider.strategy}
                onConnect={() => connectedAccountsState.handleConnect(provider.strategy)}
                onDisconnect={() => connectedAccountsState.setAccountToDisconnect(account ?? null)}
              />
            );
          })}
        </div>
      </div>

      <DisconnectAccountDialog
        account={connectedAccountsState.accountToDisconnect}
        isDisconnecting={connectedAccountsState.isDisconnecting}
        onDisconnect={connectedAccountsState.handleDisconnect}
        onClose={() => connectedAccountsState.setAccountToDisconnect(null)}
      />
    </>
  );
}
