"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { T, useGT } from "gt-next";
import { FolderInput } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FolderNode } from "@/lib/folder-tree";
import { getDescendantIds, getFolderBreadcrumb } from "@/lib/folder-tree";

interface MoveFolderDialogProps {
  folderId: string | null;
  folderMap: Map<string, FolderNode>;
  onClose: () => void;
}

export function MoveFolderDialog({ folderId, folderMap, onClose }: MoveFolderDialogProps) {
  const t = useGT();
  const moveFolderMutation = useMutation(api.noteFolders.moveFolder);

  if (!folderId) return null;

  const folder = folderMap.get(folderId);
  if (!folder) return null;

  // Filter out self and descendants
  const excluded = getDescendantIds(folderMap, folderId);
  excluded.add(folderId);

  // Also exclude the current parent (no-op move)
  const currentParentId = folder.parentId;

  const targets = Array.from(folderMap.values()).filter((f) => !excluded.has(f._id));

  async function handleMove(targetParentId: Id<"noteFolders"> | undefined) {
    try {
      await moveFolderMutation({
        id: folderId as Id<"noteFolders">,
        parentId: targetParentId,
      });
      toast.success(t("Folder moved"));
      onClose();
    } catch {
      toast.error(t("Failed to move folder"));
    }
  }

  return (
    <Dialog open={!!folderId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FolderInput className="size-4" />
            <T>Move "{folder.name}"</T>
          </DialogTitle>
          <DialogDescription className="text-xs">
            <T>Choose a new parent folder</T>
          </DialogDescription>
        </DialogHeader>
        <div className="divide-border max-h-64 divide-y overflow-y-auto rounded-lg border">
          <button
            type="button"
            onClick={() => void handleMove(undefined)}
            disabled={currentParentId === undefined}
            className="hover:bg-muted/50 w-full px-3 py-2 text-left text-xs transition disabled:opacity-50"
          >
            <span className="font-medium">
              <T>Root (no parent)</T>
            </span>
          </button>
          {targets.map((target) => {
            const breadcrumb = getFolderBreadcrumb(folderMap, target._id);
            const isCurrentParent = target._id === currentParentId;
            return (
              <button
                key={target._id}
                type="button"
                onClick={() => void handleMove(target._id as Id<"noteFolders">)}
                disabled={isCurrentParent}
                className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition disabled:opacity-50"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: target.color }}
                />
                <span className="text-muted-foreground truncate">{breadcrumb.join(" / ")}</span>
              </button>
            );
          })}
          {targets.length === 0 && (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">
              <T>No valid targets</T>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
