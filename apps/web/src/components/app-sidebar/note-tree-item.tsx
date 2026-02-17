"use client";

import { T, useGT } from "gt-next";
import {
  Archive,
  Check,
  FolderInput,
  NotebookText,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { FolderWithDepth, SidebarNote } from "@/lib/folder-tree";

interface NoteTreeItemProps {
  note: SidebarNote;
  isActive: boolean;
  folders: FolderWithDepth[];
  currentFolderId?: string;
  variant: "root" | "nested";
  onRename: (noteId: string, newTitle: string) => void;
  onTogglePin: (noteId: string, isPinned: boolean) => void;
  onMoveToFolder: (noteId: string, folderId: string | undefined) => void;
  onArchive: (noteId: string, isArchived: boolean) => void;
  onDelete: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
}

export function NoteTreeItem({
  note,
  isActive,
  folders,
  currentFolderId,
  variant,
  onRename,
  onTogglePin,
  onMoveToFolder,
  onArchive,
  onDelete,
  onRestore,
}: NoteTreeItemProps) {
  const t = useGT();
  const noteTitle = note.title || t("Untitled note");

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(noteTitle);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [isRenaming]);

  function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== noteTitle) {
      onRename(note._id, trimmed);
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenameValue(noteTitle);
      setIsRenaming(false);
    }
  }

  const isTrashed = !!note.deletedAt;

  const contextMenuContent = isTrashed ? (
    <ContextMenuContent>
      {onRestore && (
        <ContextMenuItem onClick={() => onRestore(note._id)}>
          <RotateCcw className="size-3.5" />
          <T>Restore</T>
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
        <Trash2 className="size-3.5" />
        <T>Delete permanently</T>
      </ContextMenuItem>
    </ContextMenuContent>
  ) : (
    <ContextMenuContent>
      <ContextMenuItem
        onClick={() => {
          setRenameValue(noteTitle);
          setIsRenaming(true);
        }}
      >
        <Pencil className="size-3.5" />
        <T>Rename</T>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onTogglePin(note._id, !note.isPinned)}>
        {note.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        {note.isPinned ? <T>Unpin</T> : <T>Pin</T>}
      </ContextMenuItem>
      {folders.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2.5">
            <FolderInput className="size-3.5" />
            <T>Move to</T>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onMoveToFolder(note._id, undefined)}>
              <span className="truncate">
                <T>Unfiled</T>
              </span>
              {!currentFolderId && !note.folderId && (
                <Check className="ml-auto size-3.5 shrink-0" />
              )}
            </ContextMenuItem>
            {folders.map(({ folder, depth }) => {
              const isCurrent = folder._id === (currentFolderId ?? note.folderId);
              return (
                <ContextMenuItem
                  key={folder._id}
                  onClick={() => onMoveToFolder(note._id, folder._id)}
                  style={{ paddingLeft: `${12 + depth * 12}px` }}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="truncate">{folder.name}</span>
                  {isCurrent && <Check className="ml-auto size-3.5 shrink-0" />}
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onArchive(note._id, !note.isArchived)}>
        <Archive className="size-3.5" />
        {note.isArchived ? <T>Restore note</T> : <T>Archive note</T>}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
        <Trash2 className="size-3.5" />
        <T>Move to trash</T>
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const deleteDialog = (
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isTrashed ? <T>Delete permanently?</T> : <T>Move to trash?</T>}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isTrashed ? (
              <T>This note will be permanently deleted. This cannot be undone.</T>
            ) : (
              <T>This note will be moved to trash. You can restore it later.</T>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">
            <T>Cancel</T>
          </AlertDialogCancel>
          <AlertDialogAction size="sm" variant="destructive" onClick={() => onDelete(note._id)}>
            {isTrashed ? <T>Delete permanently</T> : <T>Move to trash</T>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (variant === "nested") {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <SidebarMenuSubItem>
              {isRenaming ? (
                <div className="flex h-7 items-center px-2">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={handleRenameSubmit}
                    className="text-sidebar-foreground bg-sidebar-accent ring-sidebar-ring w-full min-w-0 rounded-sm px-1.5 py-0.5 text-sm ring-1 outline-none"
                  />
                </div>
              ) : (
                <SidebarMenuSubButton asChild size="sm" isActive={isActive}>
                  <Link href={`/notes/${note._id}`}>
                    <span className="truncate">{noteTitle}</span>
                  </Link>
                </SidebarMenuSubButton>
              )}
            </SidebarMenuSubItem>
          </ContextMenuTrigger>
          {contextMenuContent}
        </ContextMenu>
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuItem>
            {isRenaming ? (
              <div className="flex h-9 items-center gap-2 px-3">
                <NotebookText className="size-4 shrink-0" />
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameSubmit}
                  className="text-sidebar-foreground bg-sidebar-accent ring-sidebar-ring min-w-0 flex-1 rounded-sm px-1.5 py-0.5 text-sm ring-1 outline-none"
                />
              </div>
            ) : (
              <SidebarMenuButton asChild isActive={isActive} tooltip={noteTitle}>
                <Link href={`/notes/${note._id}`}>
                  <NotebookText className="size-4" />
                  <span className="truncate">{noteTitle}</span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>
      {deleteDialog}
    </>
  );
}
