"use client";

import type { useUser } from "@clerk/nextjs";
import { useUser as useClerkUser, useReverification } from "@clerk/nextjs";
import { useState } from "react";
import { toast } from "sonner";

import { logWebClientEvent } from "@/lib/observability/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailAddress = NonNullable<ReturnType<typeof useUser>["user"]>["emailAddresses"][number];

type VerificationMode =
  | { type: "none" }
  | { type: "new"; email: EmailAddress }
  | { type: "existing"; email: EmailAddress };

export type { EmailAddress, VerificationMode };

type EmailState = ReturnType<typeof useEmailAddressesState>;

function useEmailAddressesState() {
  const { user, isLoaded } = useClerkUser();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [verificationMode, setVerificationMode] = useState<VerificationMode>({
    type: "none",
  });
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<EmailAddress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingPrimary, setIsSettingPrimary] = useState<string | null>(null);

  return {
    user,
    isLoaded,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isAdding,
    setIsAdding,
    newEmail,
    setNewEmail,
    verificationMode,
    setVerificationMode,
    verificationCode,
    setVerificationCode,
    isVerifying,
    setIsVerifying,
    isSendingCode,
    setIsSendingCode,
    emailToDelete,
    setEmailToDelete,
    isDeleting,
    setIsDeleting,
    isSettingPrimary,
    setIsSettingPrimary,
  };
}

function useEmailAddActions(
  state: EmailState,
  createEmailWithReverification: (email: string) => Promise<EmailAddress | undefined>,
  setPrimaryWithReverification: (emailId: string) => Promise<void>,
) {
  const { user, newEmail } = state;

  const handleAddEmail = async () => {
    const trimmedEmail = newEmail.trim();
    if (!user || !trimmedEmail) {
      toast.error("Please enter an email address");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    state.setIsAdding(true);
    try {
      const emailAddress = await createEmailWithReverification(trimmedEmail);
      if (emailAddress) {
        logWebClientEvent({ event: "web.settings.email.added", level: "info" });
        state.setVerificationMode({ type: "new", email: emailAddress });
        state.setIsAddDialogOpen(false);
        toast.success("Verification code sent to your email");
      }
    } catch (error) {
      console.error("Failed to add email:", error);
      logWebClientEvent({
        event: "web.settings.email.add_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      const message = error instanceof Error ? error.message : "Failed to add email";
      toast.error(message);
    } finally {
      state.setIsAdding(false);
    }
  };

  const handleSetPrimary = async (emailId: string) => {
    if (!user) return;
    if (state.isSettingPrimary) return;
    state.setIsSettingPrimary(emailId);
    try {
      await setPrimaryWithReverification(emailId);
      logWebClientEvent({ event: "web.settings.email.primary_changed", level: "info" });
      toast.success("Primary email updated");
    } catch (error) {
      console.error("Failed to set primary email:", error);
      logWebClientEvent({
        event: "web.settings.email.set_primary_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error), emailId },
      });
      toast.error("Failed to update primary email");
    } finally {
      state.setIsSettingPrimary(null);
    }
  };

  return { handleAddEmail, handleSetPrimary };
}

function useEmailVerifyActions(state: EmailState) {
  const { verificationMode, verificationCode } = state;

  const handleVerify = async () => {
    if (verificationMode.type === "none" || !verificationCode.trim()) {
      toast.error("Please enter the verification code");
      return;
    }
    state.setIsVerifying(true);
    try {
      await verificationMode.email.attemptVerification({
        code: verificationCode,
      });
      toast.success("Email verified successfully");
      state.setVerificationMode({ type: "none" });
      state.setVerificationCode("");
      state.setNewEmail("");
    } catch (error) {
      console.error("Failed to verify email:", error);
      toast.error("Invalid verification code. Please try again.");
    } finally {
      state.setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (verificationMode.type === "none") return;
    state.setIsSendingCode(true);
    try {
      await verificationMode.email.prepareVerification({
        strategy: "email_code",
      });
      toast.success("Verification code resent");
    } catch (error) {
      console.error("Failed to resend code:", error);
      logWebClientEvent({
        event: "web.settings.email.resend_code_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      toast.error("Failed to resend code. Please try again.");
    } finally {
      state.setIsSendingCode(false);
    }
  };

  const handleStartVerification = async (email: EmailAddress) => {
    state.setIsSendingCode(true);
    try {
      await email.prepareVerification({ strategy: "email_code" });
      state.setVerificationMode({ type: "existing", email });
      toast.success("Verification code sent");
    } catch (error) {
      console.error("Failed to send verification:", error);
      logWebClientEvent({
        event: "web.settings.email.start_verification_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      toast.error("Failed to send verification code");
    } finally {
      state.setIsSendingCode(false);
    }
  };

  const closeVerificationDialog = () => {
    const wasNewEmail = verificationMode.type === "new";
    state.setVerificationMode({ type: "none" });
    state.setVerificationCode("");
    if (wasNewEmail) state.setNewEmail("");
  };

  return {
    handleVerify,
    handleResendCode,
    handleStartVerification,
    closeVerificationDialog,
  };
}

function useEmailDeleteAction(state: EmailState) {
  const { emailToDelete } = state;

  const handleDeleteEmail = async () => {
    if (!emailToDelete) return;
    state.setIsDeleting(true);
    try {
      await emailToDelete.destroy();
      logWebClientEvent({ event: "web.settings.email.deleted", level: "info" });
      toast.success("Email removed");
      state.setEmailToDelete(null);
    } catch (error) {
      console.error("Failed to delete email:", error);
      logWebClientEvent({
        event: "web.settings.email.delete_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      toast.error("Failed to remove email");
    } finally {
      state.setIsDeleting(false);
    }
  };

  return { handleDeleteEmail };
}

export function useEmailAddresses() {
  const state = useEmailAddressesState();

  const createEmailWithReverification = useReverification(async (email: string) => {
    const emailAddress = await state.user?.createEmailAddress({ email });
    if (emailAddress) {
      await emailAddress.prepareVerification({ strategy: "email_code" });
    }
    return emailAddress;
  });

  const setPrimaryWithReverification = useReverification(async (emailId: string) => {
    await state.user?.update({ primaryEmailAddressId: emailId });
  });

  const { handleAddEmail, handleSetPrimary } = useEmailAddActions(
    state,
    createEmailWithReverification,
    setPrimaryWithReverification,
  );
  const verifyActions = useEmailVerifyActions(state);
  const { handleDeleteEmail } = useEmailDeleteAction(state);

  return {
    user: state.user,
    isLoaded: state.isLoaded,
    isAddDialogOpen: state.isAddDialogOpen,
    setIsAddDialogOpen: state.setIsAddDialogOpen,
    isAdding: state.isAdding,
    newEmail: state.newEmail,
    setNewEmail: state.setNewEmail,
    verificationMode: state.verificationMode,
    verificationCode: state.verificationCode,
    setVerificationCode: state.setVerificationCode,
    isVerifying: state.isVerifying,
    isSendingCode: state.isSendingCode,
    emailToDelete: state.emailToDelete,
    setEmailToDelete: state.setEmailToDelete,
    isDeleting: state.isDeleting,
    isSettingPrimary: state.isSettingPrimary,
    handleAddEmail,
    handleSetPrimary,
    handleDeleteEmail,
    ...verifyActions,
  };
}
