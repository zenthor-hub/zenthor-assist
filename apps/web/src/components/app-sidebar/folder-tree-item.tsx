"use client";

import { T } from "gt-next";
import { ChevronRight, FolderInput, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub } from "@/components/ui/sidebar";
import type { FolderNode, FolderWithDepth, SidebarNote } from "@/lib/folder-tree";
import { cn } from "@/lib/utils";

import { NoteTreeItem } from "./note-tree-item";

interface FolderTreeItemProps {
  folder: FolderNode;
  notesByFolder: Map<string, SidebarNote[]>;
  collapsedFolders: Set<string>;
  onToggle: (folderId: string) => void;
  onRenameNote: (noteId: string, newTitle: string) => void;
  onToggleNotePin: (noteId: string, isPinned: boolean) => void;
  onMoveNoteToFolder: (noteId: string, folderId: string | undefined) => void;
  onArchiveNote: (noteId: string, isArchived: boolean) => void;
  onDeleteNote: (noteId: string) => void;
  allFolders: FolderWithDepth[];
  onNewSubfolder: (parentId: string) => void;
  onRename: (folderId: string, newName: string) => void;
  onMove: (folderId: string) => void;
  onDelete: (folderId: string) => void;
}

/** Count all notes recursively under a folder node (includes children). */
function countNotesRecursive(
  folder: FolderNode,
  notesByFolder: Map<string, SidebarNote[]>,
): number {
  let count = notesByFolder.get(folder._id)?.length ?? 0;
  for (const child of folder.children) {
    count += countNotesRecursive(child, notesByFolder);
  }
  return count;
}

export function FolderTreeItem({
  folder,
  notesByFolder,
  collapsedFolders,
  onToggle,
  onRenameNote,
  onToggleNotePin,
  onMoveNoteToFolder,
  onArchiveNote,
  onDeleteNote,
  allFolders,
  onNewSubfolder,
  onRename,
  onMove,
  onDelete,
}: FolderTreeItemProps) {
  const pathname = usePathname();
  const isOpen = !collapsedFolders.has(folder._id);
  const notes = notesByFolder.get(folder._id) ?? [];
  const hasChildren = folder.children.length > 0 || notes.length > 0;
  const totalNoteCount = countNotesRecursive(folder, notesByFolder);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
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
    if (trimmed && trimmed !== folder.name) {
      onRename(folder._id, trimmed);
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenameValue(folder.name);
      setIsRenaming(false);
    }
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={() => onToggle(folder._id)}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <SidebarMenuItem>
              {isRenaming ? (
                <div className="flex h-9 items-center gap-2 px-3">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: folder.color }}
                  />
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
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={folder.name}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="truncate">{folder.name}</span>
                    {totalNoteCount > 0 && (
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {totalNoteCount}
                      </span>
                    )}
                    <ChevronRight
                      className={cn(
                        "text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
              )}
              {hasChildren && (
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {folder.children.map((child) => (
                      <FolderTreeItem
                        key={child._id}
                        folder={child}
                        notesByFolder={notesByFolder}
                        collapsedFolders={collapsedFolders}
                        onToggle={onToggle}
                        onRenameNote={onRenameNote}
                        onToggleNotePin={onToggleNotePin}
                        onMoveNoteToFolder={onMoveNoteToFolder}
                        onArchiveNote={onArchiveNote}
                        onDeleteNote={onDeleteNote}
                        allFolders={allFolders}
                        onNewSubfolder={onNewSubfolder}
                        onRename={onRename}
                        onMove={onMove}
                        onDelete={onDelete}
                      />
                    ))}
                    {notes.map((note) => (
                      <NoteTreeItem
                        key={note._id}
                        note={note}
                        isActive={pathname === `/notes/${note._id}`}
                        folders={allFolders}
                        currentFolderId={folder._id}
                        variant="nested"
                        onRename={onRenameNote}
                        onTogglePin={onToggleNotePin}
                        onMoveToFolder={onMoveNoteToFolder}
                        onArchive={onArchiveNote}
                        onDelete={onDeleteNote}
                      />
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              )}
            </SidebarMenuItem>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onNewSubfolder(folder._id)}>
              <FolderPlus className="size-3.5" />
              <T>New subfolder</T>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setRenameValue(folder.name);
                setIsRenaming(true);
              }}
            >
              <Pencil className="size-3.5" />
              <T>Rename</T>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onMove(folder._id)}>
              <FolderInput className="size-3.5" />
              <T>Move to…</T>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="size-3.5" />
              <T>Delete folder</T>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Collapsible>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T>Delete "{folder.name}"?</T>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {folder.children.length > 0 ? (
                <T>
                  Child folders will be moved to the parent level. Notes in this folder will become
                  unfiled.
                </T>
              ) : notes.length > 0 ? (
                <T>Notes in this folder will become unfiled.</T>
              ) : (
                <T>This empty folder will be removed.</T>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">
              <T>Cancel</T>
            </AlertDialogCancel>
            <AlertDialogAction size="sm" variant="destructive" onClick={() => onDelete(folder._id)}>
              <T>Delete</T>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
