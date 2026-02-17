"use client";

import { T, useGT } from "gt-next";
import {
  Archive,
  ChevronRight,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import type { FolderNode } from "@/lib/folder-tree";
import { cn } from "@/lib/utils";

interface SidebarNote {
  _id: string;
  title?: string;
}

interface FolderTreeItemProps {
  folder: FolderNode;
  notesByFolder: Map<string, SidebarNote[]>;
  collapsedFolders: Set<string>;
  onToggle: (folderId: string) => void;
  onArchiveNote: (e: React.MouseEvent, noteId: string) => void;
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
  onArchiveNote,
  onNewSubfolder,
  onRename,
  onMove,
  onDelete,
}: FolderTreeItemProps) {
  const pathname = usePathname();
  const t = useGT();
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
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
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
        <SidebarMenuItem>
          {isRenaming ? (
            <div className="flex items-center gap-1.5 px-2 py-1">
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
                className="text-sidebar-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          ) : (
            <>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={folder.name} className="pr-7">
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
              <div className="absolute top-0.5 right-0.5 opacity-0 transition-opacity group-hover/menu-item:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="text-sidebar-foreground hover:bg-sidebar-accent flex size-5 items-center justify-center rounded-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem onClick={() => onNewSubfolder(folder._id)}>
                      <FolderPlus className="size-3.5" />
                      <T>New subfolder</T>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameValue(folder.name);
                        setIsRenaming(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      <T>Rename</T>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMove(folder._id)}>
                      <FolderInput className="size-3.5" />
                      <T>Move to…</T>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      <T>Delete folder</T>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
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
                    onArchiveNote={onArchiveNote}
                    onNewSubfolder={onNewSubfolder}
                    onRename={onRename}
                    onMove={onMove}
                    onDelete={onDelete}
                  />
                ))}
                {notes.map((note) => {
                  const isActive = pathname === `/notes/${note._id}`;
                  const noteTitle = note.title || t("Untitled note");
                  return (
                    <SidebarMenuSubItem key={note._id}>
                      <SidebarMenuSubButton asChild size="sm" isActive={isActive}>
                        <Link href={`/notes/${note._id}`}>
                          <span className="truncate">{noteTitle}</span>
                        </Link>
                      </SidebarMenuSubButton>
                      <button
                        type="button"
                        onClick={(e) => onArchiveNote(e, note._id)}
                        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-0.5 right-1 flex size-5 items-center justify-center rounded-md opacity-0 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100"
                      >
                        <Archive className="size-3" />
                      </button>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          )}
        </SidebarMenuItem>
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
