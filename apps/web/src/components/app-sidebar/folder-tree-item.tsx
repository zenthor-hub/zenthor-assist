"use client";

import { T, useGT } from "gt-next";
import {
  Archive,
  ChevronRight,
  FolderPlus,
  FolderInput,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  onRename: (folderId: string) => void;
  onMove: (folderId: string) => void;
  onDelete: (folderId: string) => void;
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

  return (
    <Collapsible open={isOpen} onOpenChange={() => onToggle(folder._id)}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={folder.name} className="group/folder-btn">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: folder.color }}
            />
            <span className="truncate">{folder.name}</span>
            <ChevronRight
              className={cn(
                "text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <div className="absolute top-0.5 right-1 opacity-0 group-hover/menu-item:opacity-100">
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
              <DropdownMenuItem onClick={() => onRename(folder._id)}>
                <Pencil className="size-3.5" />
                <T>Rename</T>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(folder._id)}>
                <FolderInput className="size-3.5" />
                <T>Move to…</T>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(folder._id)}>
                <Trash2 className="size-3.5" />
                <T>Delete folder</T>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasChildren && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {/* Render child folders recursively */}
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
              {/* Render notes in this folder */}
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
  );
}
