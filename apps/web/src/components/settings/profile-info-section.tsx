"use client";

import { Camera, Loader2, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logWebClientEvent } from "@/lib/observability/client";
import { cn } from "@/lib/utils";

import type { ClerkUser } from "./types";

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

const SUPPORTED_IMAGE_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp";
const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function getInitials(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.charAt(0)?.toUpperCase() ?? "";
  const last = lastName?.charAt(0)?.toUpperCase() ?? "";
  return first + last || "?";
}

function useProfileEdit(user: ClerkUser) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clearFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenEditDialog = () => {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setIsEditDialogOpen(true);
  };

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      logWebClientEvent({ event: "web.settings.profile.updated", level: "info" });
      toast.success("Profile updated successfully");
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      logWebClientEvent({
        event: "web.settings.profile.update_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isSupported = SUPPORTED_IMAGE_TYPES.includes(
      file.type as (typeof SUPPORTED_IMAGE_TYPES)[number],
    );
    if (!isSupported) {
      toast.error("Please use JPG, PNG, GIF, or WebP format");
      clearFileInput();
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("Image must be less than 10MB");
      clearFileInput();
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await user.setProfileImage({ file });
      logWebClientEvent({ event: "web.settings.profile.avatar_uploaded", level: "info" });
      toast.success("Profile photo updated");
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      logWebClientEvent({
        event: "web.settings.profile.avatar_upload_failed",
        level: "error",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
      toast.error("Failed to upload photo. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
      clearFileInput();
    }
  };

  return {
    isEditDialogOpen,
    setIsEditDialogOpen,
    isUpdating,
    isUploadingAvatar,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    fileInputRef,
    handleOpenEditDialog,
    handleUpdateProfile,
    handleAvatarClick,
    handleAvatarChange,
  };
}

function EditProfileDialog({
  open,
  onOpenChange,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  isUpdating,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  isUpdating: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your profile information</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => onFirstNameChange(e.target.value)}
              placeholder="Enter your first name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => onLastNameChange(e.target.value)}
              placeholder="Enter your last name"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isUpdating}>
            {isUpdating && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileInfoSection({ user }: { user: ClerkUser }) {
  const profileEdit = useProfileEdit(user);
  const displayName = user.fullName || user.firstName || "User";

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <div className="group relative">
            <Avatar className="dark:border-border size-12 border-2 border-neutral-200">
              <AvatarImage src={user.imageUrl} alt={displayName} />
              <AvatarFallback className="text-sm">
                {getInitials(user.firstName, user.lastName)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={profileEdit.handleAvatarClick}
              disabled={profileEdit.isUploadingAvatar}
              className={cn(
                "absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed",
                profileEdit.isUploadingAvatar ? "opacity-100" : "opacity-0",
              )}
            >
              {profileEdit.isUploadingAvatar ? (
                <Loader2 className="size-5 animate-spin text-white" />
              ) : (
                <Camera className="size-5 text-white" />
              )}
            </button>
            <input
              ref={profileEdit.fileInputRef}
              type="file"
              accept={SUPPORTED_IMAGE_EXTENSIONS}
              onChange={profileEdit.handleAvatarChange}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">{displayName}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={profileEdit.handleOpenEditDialog}>
          <Pencil className="size-4" />
          Edit
        </Button>
      </div>

      <EditProfileDialog
        open={profileEdit.isEditDialogOpen}
        onOpenChange={profileEdit.setIsEditDialogOpen}
        firstName={profileEdit.firstName}
        lastName={profileEdit.lastName}
        onFirstNameChange={profileEdit.setFirstName}
        onLastNameChange={profileEdit.setLastName}
        isUpdating={profileEdit.isUpdating}
        onSave={profileEdit.handleUpdateProfile}
      />
    </>
  );
}
