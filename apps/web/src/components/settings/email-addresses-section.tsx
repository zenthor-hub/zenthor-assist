"use client";

import { T, useGT } from "gt-next";
import { Link2, Loader2, Mail, MoreHorizontal, Plus, Shield } from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ClerkUser } from "./types";
import type { EmailAddress, useEmailAddresses, VerificationMode } from "./use-email-addresses";

function EmailRow({
  email,
  isPrimary,
  isVerified,
  isLinked,
  isSettingPrimary,
  isSendingCode,
  onSetPrimary,
  onVerify,
  onDelete,
}: {
  email: EmailAddress;
  isPrimary: boolean;
  isVerified: boolean;
  isLinked: boolean;
  isSettingPrimary: boolean;
  isSendingCode: boolean;
  onSetPrimary: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-border flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <Mail className="text-muted-foreground size-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{email.emailAddress}</span>
            {isPrimary && (
              <Badge variant="secondary" className="text-xs">
                <T>Primary</T>
              </Badge>
            )}
            {isVerified ? (
              <Badge
                variant="outline"
                className="border-green-500/30 bg-green-500/10 text-xs text-green-600 dark:text-green-400"
              >
                <Shield className="mr-1 size-3" />
                <T>Verified</T>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
              >
                <T>Unverified</T>
              </Badge>
            )}
            {isLinked && (
              <Badge
                variant="outline"
                className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
              >
                <Link2 className="mr-1 size-3" />
                <T>Linked</T>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {!isPrimary && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isVerified ? (
              <DropdownMenuItem onClick={onSetPrimary} disabled={isSettingPrimary}>
                {isSettingPrimary && <Loader2 className="mr-2 size-4 animate-spin" />}
                <T>Set as primary</T>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onVerify} disabled={isSendingCode}>
                {isSendingCode && <Loader2 className="mr-2 size-4 animate-spin" />}
                <T>Verify email</T>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <T>Remove</T>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function AddEmailDialog({
  open,
  onOpenChange,
  email,
  onEmailChange,
  isAdding,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onEmailChange: (email: string) => void;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const t = useGT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <T>Add Email Address</T>
          </DialogTitle>
          <DialogDescription>
            <T>Add a new email address to your account. You&apos;ll need to verify it.</T>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="grid gap-2">
            <Label htmlFor="new-email">
              <T>Email address</T>
            </Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t("Enter email address")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAdding) onAdd();
              }}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEmailChange("");
            }}
            disabled={isAdding}
          >
            <T>Cancel</T>
          </Button>
          <Button onClick={onAdd} disabled={isAdding}>
            {isAdding && <Loader2 className="size-4 animate-spin" />}
            <T>Add email</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyEmailDialog({
  verificationMode,
  code,
  onCodeChange,
  isVerifying,
  isSendingCode,
  onVerify,
  onResend,
  onClose,
}: {
  verificationMode: VerificationMode;
  code: string;
  onCodeChange: (code: string) => void;
  isVerifying: boolean;
  isSendingCode: boolean;
  onVerify: () => void;
  onResend: () => void;
  onClose: () => void;
}) {
  const t = useGT();

  return (
    <Dialog
      open={verificationMode.type !== "none"}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <T>Verify Email</T>
          </DialogTitle>
          <DialogDescription>
            {t("Enter the verification code sent to {email}", {
              email: verificationMode.type !== "none" ? verificationMode.email.emailAddress : "",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="grid gap-2">
            <Label htmlFor="verification-code">
              <T>Verification code</T>
            </Label>
            <Input
              id="verification-code"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder={t("Enter 6-digit code")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isVerifying) onVerify();
              }}
            />
          </div>
          <button
            type="button"
            onClick={onResend}
            disabled={isSendingCode}
            aria-label={t("Resend verification code")}
            className="text-primary mt-2 text-sm hover:underline disabled:opacity-50"
          >
            {isSendingCode ? <T>Sending...</T> : <T>Resend code</T>}
          </button>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isVerifying}>
            <T>Cancel</T>
          </Button>
          <Button onClick={onVerify} disabled={isVerifying}>
            {isVerifying && <Loader2 className="size-4 animate-spin" />}
            <T>Verify</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEmailDialog({
  email,
  isDeleting,
  onDelete,
  onClose,
}: {
  email: EmailAddress | null;
  isDeleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useGT();

  return (
    <AlertDialog open={email !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T>Remove Email Address</T>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("Are you sure you want to remove {email}? This action cannot be undone.", {
              email: email?.emailAddress ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            <T>Cancel</T>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
            <T>Remove</T>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmailAddressesSection({
  user,
  emailState,
}: {
  user: ClerkUser;
  emailState: ReturnType<typeof useEmailAddresses>;
}) {
  const linkedEmails = new Set(
    user.externalAccounts.map((account) => account.emailAddress?.toLowerCase()).filter(Boolean),
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">
              <T>Email Addresses</T>
            </h3>
            <p className="text-muted-foreground text-xs">
              <T>Manage your email addresses</T>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => emailState.setIsAddDialogOpen(true)}>
            <Plus className="size-4" />
            <T>Add</T>
          </Button>
        </div>
        <div className="space-y-3">
          {[...user.emailAddresses]
            .sort((a, b) => {
              if (a.id === user.primaryEmailAddressId) return -1;
              if (b.id === user.primaryEmailAddressId) return 1;
              return 0;
            })
            .map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                isPrimary={email.id === user.primaryEmailAddressId}
                isVerified={email.verification.status === "verified"}
                isLinked={linkedEmails.has(email.emailAddress.toLowerCase())}
                isSettingPrimary={emailState.isSettingPrimary === email.id}
                isSendingCode={emailState.isSendingCode}
                onSetPrimary={() => emailState.handleSetPrimary(email.id)}
                onVerify={() => emailState.handleStartVerification(email)}
                onDelete={() => emailState.setEmailToDelete(email)}
              />
            ))}
        </div>
      </div>

      <AddEmailDialog
        open={emailState.isAddDialogOpen}
        onOpenChange={emailState.setIsAddDialogOpen}
        email={emailState.newEmail}
        onEmailChange={emailState.setNewEmail}
        isAdding={emailState.isAdding}
        onAdd={emailState.handleAddEmail}
      />

      <VerifyEmailDialog
        verificationMode={emailState.verificationMode}
        code={emailState.verificationCode}
        onCodeChange={emailState.setVerificationCode}
        isVerifying={emailState.isVerifying}
        isSendingCode={emailState.isSendingCode}
        onVerify={emailState.handleVerify}
        onResend={emailState.handleResendCode}
        onClose={emailState.closeVerificationDialog}
      />

      <DeleteEmailDialog
        email={emailState.emailToDelete}
        isDeleting={emailState.isDeleting}
        onDelete={emailState.handleDeleteEmail}
        onClose={() => emailState.setEmailToDelete(null)}
      />
    </>
  );
}
