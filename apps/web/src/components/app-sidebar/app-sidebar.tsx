"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  CheckSquare,
  ChevronRight,
  FolderPlus,
  House,
  LayoutGrid,
  MessageCircle,
  MessageSquare,
  NotebookText,
  Plus,
  Settings,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { toast } from "sonner";

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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  type SidebarNote,
  buildFolderTree,
  flattenTreeWithDepth,
  groupNotesByFolder,
} from "@/lib/folder-tree";
import { cn } from "@/lib/utils";

import { FolderTreeItem } from "./folder-tree-item";
import { MoveFolderDialog } from "./move-folder-dialog";
import { NavUser } from "./nav-user";
import { NoteTreeItem } from "./note-tree-item";
import { ThemeSwitcher } from "./theme-switcher";

type SidebarMode = "nav" | "chats" | "notes" | "settings";

interface SidebarConversation {
  _id: string;
  _creationTime: number;
  channel: "web" | "whatsapp" | "telegram";
  title?: string;
}

interface SidebarFolder {
  _id: string;
  name: string;
  color: string;
  position: number;
  parentId?: string;
}

const PRESET_FOLDER_COLORS = [
  "#60a5fa",
  "#38bdf8",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#fb923c",
  "#c084fc",
  "#f87171",
  "#a78bfa",
  "#22c55e",
];

function getSidebarModeFromPath(pathname: string): SidebarMode {
  if (pathname.startsWith("/chat")) return "chats";
  if (pathname.startsWith("/notes")) return "notes";
  if (pathname.startsWith("/settings")) return "settings";
  return "nav";
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useGT();
  const [mode, setMode] = useState<SidebarMode>(() => getSidebarModeFromPath(pathname));
  const transitionDir = useRef<"forward" | "back" | null>(null);

  function goToChats() {
    transitionDir.current = "forward";
    setMode("chats");
    router.push("/chat/overview");
  }

  function goToSettings() {
    transitionDir.current = "forward";
    setMode("settings");
    router.push("/settings/general");
  }

  function goToNotes() {
    transitionDir.current = "forward";
    setMode("notes");
    router.push("/notes");
  }

  function goToNav() {
    transitionDir.current = "back";
    setMode("nav");
  }

  const conversations = (useQuery(api.conversations.listRecentWithLastMessage, {}) ??
    []) as SidebarConversation[];
  const activeNotes = (useQuery(api.notes.list, {
    isArchived: false,
    limit: 200,
  }) ?? []) as SidebarNote[];
  const archivedNotes = (useQuery(api.notes.list, {
    isArchived: true,
    limit: 200,
  }) ?? []) as SidebarNote[];
  const trashedNotes = (useQuery(api.notes.listTrashed, { limit: 200 }) ?? []) as SidebarNote[];
  const archiveConversation = useMutation(api.conversations.archive);
  const archiveNote = useMutation(api.notes.archive);
  const updateNote = useMutation(api.notes.update);
  const deleteNote = useMutation(api.notes.deleteNote);
  const restoreNote = useMutation(api.notes.restoreNote);
  const permanentlyDeleteNote = useMutation(api.notes.permanentlyDelete);
  const emptyTrash = useMutation(api.notes.emptyTrash);
  const moveNoteToFolder = useMutation(api.notes.moveToFolder);
  const folders = (useQuery(api.noteFolders.list) ?? []) as SidebarFolder[];
  const createFolder = useMutation(api.noteFolders.create);
  const updateFolder = useMutation(api.noteFolders.update);
  const removeFolder = useMutation(api.noteFolders.remove);
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(PRESET_FOLDER_COLORS[0]!);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [subfoldingParentId, setSubfoldingParentId] = useState<string | null>(null);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Only rebuilds when folders change (structure)
  const folderTree = useMemo(
    () => buildFolderTree(folders, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folders ref from useQuery
    [folders],
  );
  const flatFolders = useMemo(() => flattenTreeWithDepth(folderTree.roots), [folderTree]);

  // Filter notes by search query
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeNotes ref from useQuery
  const filteredActiveNotes = useMemo(() => {
    if (!noteSearch.trim()) return activeNotes;
    const q = noteSearch.trim().toLowerCase();
    return activeNotes.filter((n) => (n.title ?? "").toLowerCase().includes(q));
  }, [activeNotes, noteSearch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- archivedNotes ref from useQuery
  const filteredArchivedNotes = useMemo(() => {
    if (!noteSearch.trim()) return archivedNotes;
    const q = noteSearch.trim().toLowerCase();
    return archivedNotes.filter((n) => (n.title ?? "").toLowerCase().includes(q));
  }, [archivedNotes, noteSearch]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- trashedNotes ref from useQuery
  const filteredTrashedNotes = useMemo(() => {
    if (!noteSearch.trim()) return trashedNotes;
    const q = noteSearch.trim().toLowerCase();
    return trashedNotes.filter((n) => (n.title ?? "").toLowerCase().includes(q));
  }, [trashedNotes, noteSearch]);

  // Only rebuilds when filtered notes change (grouping)
  const noteGrouping = useMemo(
    () => groupNotesByFolder(filteredActiveNotes),
    [filteredActiveNotes],
  );

  function toggleFolder(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder({
        name,
        color: newFolderColor,
        parentId: subfoldingParentId ? (subfoldingParentId as Id<"noteFolders">) : undefined,
      });
      setNewFolderName("");
      setNewFolderColor(PRESET_FOLDER_COLORS[0]!);
      setShowNewFolderForm(false);
      setSubfoldingParentId(null);
      toast.success(t("Folder created"));
    } catch {
      toast.error(t("Failed to create folder"));
    }
  }

  async function handleDeleteFolder(folderId: string) {
    try {
      await removeFolder({ id: folderId as Id<"noteFolders"> });
      toast.success(t("Folder removed"));
    } catch {
      toast.error(t("Failed to remove folder"));
    }
  }

  function handleNewSubfolder(parentId: string) {
    setSubfoldingParentId(parentId);
    setShowNewFolderForm(true);
    setTimeout(() => newFolderInputRef.current?.focus(), 0);
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    try {
      await updateFolder({ id: folderId as Id<"noteFolders">, name: newName });
      toast.success(t("Folder renamed"));
    } catch {
      toast.error(t("Failed to rename folder"));
    }
  }

  // Auto-expand ancestor folders when navigating to a note
  useEffect(() => {
    const noteMatch = pathname.match(/^\/notes\/(.+)$/);
    if (!noteMatch) return;
    const activeNoteId = noteMatch[1];

    // Find which folder contains this note and expand all ancestors
    for (const [folderId, folderNotes] of noteGrouping.notesByFolder) {
      if (folderNotes.some((n) => n._id === activeNoteId)) {
        // Walk up the tree and expand all ancestors
        const toExpand: string[] = [];
        let current = folderTree.folderMap.get(folderId);
        while (current) {
          toExpand.push(current._id);
          current = current.parentId ? folderTree.folderMap.get(current.parentId) : undefined;
        }

        if (toExpand.length > 0) {
          setCollapsedFolders((prev) => {
            const needsUpdate = toExpand.some((id) => prev.has(id));
            if (!needsUpdate) return prev;
            const next = new Set(prev);
            for (const id of toExpand) next.delete(id);
            return next;
          });
        }
        break;
      }
    }
  }, [pathname, folderTree, noteGrouping]);

  useEffect(() => {
    setMode(getSidebarModeFromPath(pathname));
  }, [pathname]);

  async function handleArchive(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await archiveConversation({
        id: conversationId as Parameters<typeof archiveConversation>[0]["id"],
      });
      toast.success(t("Conversation archived"));
      if (pathname.includes(conversationId)) {
        router.push("/chat/overview");
      }
    } catch {
      toast.error(t("Failed to archive conversation"));
    }
  }

  async function handleArchiveNote(noteId: string, isArchived: boolean) {
    try {
      await archiveNote({
        id: noteId as Parameters<typeof archiveNote>[0]["id"],
        isArchived,
      });
      toast.success(isArchived ? t("Note archived") : t("Note restored"));
      if (pathname === `/notes/${noteId}`) {
        router.push("/notes");
      }
    } catch {
      toast.error(isArchived ? t("Failed to archive note") : t("Failed to restore note"));
    }
  }

  async function handleRenameNote(noteId: string, newTitle: string) {
    try {
      await updateNote({ id: noteId as Id<"notes">, title: newTitle });
      toast.success(t("Note renamed"));
    } catch {
      toast.error(t("Failed to rename note"));
    }
  }

  async function handleToggleNotePin(noteId: string, isPinned: boolean) {
    try {
      await updateNote({ id: noteId as Id<"notes">, isPinned });
      toast.success(isPinned ? t("Note pinned") : t("Note unpinned"));
    } catch {
      toast.error(t("Failed to update note"));
    }
  }

  async function handleMoveNoteToFolder(noteId: string, folderId: string | undefined) {
    try {
      await moveNoteToFolder({
        id: noteId as Id<"notes">,
        folderId: folderId as Id<"noteFolders"> | undefined,
      });
      toast.success(t("Note moved"));
    } catch {
      toast.error(t("Failed to move note"));
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await deleteNote({ id: noteId as Id<"notes"> });
      toast.success(t("Note moved to trash"));
      if (pathname === `/notes/${noteId}`) {
        router.push("/notes");
      }
    } catch {
      toast.error(t("Failed to delete note"));
    }
  }

  async function handleRestoreNote(noteId: string) {
    try {
      await restoreNote({ id: noteId as Id<"notes"> });
      toast.success(t("Note restored"));
    } catch {
      toast.error(t("Failed to restore note"));
    }
  }

  async function handlePermanentlyDeleteNote(noteId: string) {
    try {
      await permanentlyDeleteNote({ id: noteId as Id<"notes"> });
      toast.success(t("Note permanently deleted"));
      if (pathname === `/notes/${noteId}`) {
        router.push("/notes");
      }
    } catch {
      toast.error(t("Failed to delete note"));
    }
  }

  async function handleEmptyTrash() {
    try {
      await emptyTrash({});
      toast.success(t("Trash emptied"));
      setShowEmptyTrashConfirm(false);
    } catch {
      toast.error(t("Failed to empty trash"));
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Header: logo text ── */}
      <SidebarHeader className="px-3 pt-4 pb-6">
        <Link
          href="/chat/overview"
          className="flex items-center group-data-[collapsible=icon]:justify-center"
        >
          <Image
            src="/zenthor-logo-text.svg"
            alt="Zenthor"
            width={110}
            height={24}
            className="group-data-[collapsible=icon]:hidden dark:hidden"
          />
          <Image
            src="/zenthor-logo-text-dark.svg"
            alt="Zenthor"
            width={110}
            height={24}
            className="hidden dark:block dark:group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/zenthor-logo.svg"
            alt="Zenthor"
            width={24}
            height={24}
            className="hidden group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent>
        {mode === "nav" ? (
          <SidebarGroup
            key="nav"
            className={transitionDir.current === "back" ? "animate-slide-in-left" : undefined}
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/home"} tooltip={t("Home")}>
                  <Link href="/home">
                    <House className="size-4" />
                    <span>
                      <T>Home</T>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/chat")}
                  tooltip={t("Chats")}
                  onClick={goToChats}
                >
                  <MessageSquare className="size-4" />
                  <span className="flex-1">
                    <T>Chats</T>
                  </span>
                  <ArrowRight className="text-muted-foreground size-3.5" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/tasks"} tooltip={t("Tasks")}>
                  <Link href="/tasks">
                    <CheckSquare className="size-4" />
                    <span>
                      <T>Tasks</T>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/skills"} tooltip={t("Skills")}>
                  <Link href="/skills">
                    <Sparkles className="size-4" />
                    <span>
                      <T>Skills</T>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/notes")}
                  tooltip={t("Notes")}
                  onClick={goToNotes}
                >
                  <Link href="/notes">
                    <NotebookText className="size-4" />
                    <span>
                      <T>Notes</T>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/settings")}
                  tooltip={t("Settings")}
                  onClick={goToSettings}
                >
                  <Settings className="size-4" />
                  <span className="flex-1">
                    <T>Settings</T>
                  </span>
                  <ArrowRight className="text-muted-foreground size-3.5" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : mode === "chats" ? (
          <SidebarGroup key="chats" className="animate-slide-in-right">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={goToNav}
                  tooltip={t("Back to navigation")}
                  className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="flex-1 text-center font-medium">
                    <T>Chats</T>
                  </span>
                  <span className="size-4 shrink-0" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/chat/overview"}
                    tooltip={t("Overview")}
                  >
                    <Link href="/chat/overview">
                      <LayoutGrid className="size-4" />
                      <span>
                        <T>Overview</T>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                {conversations?.map((conv) => {
                  const isActive = pathname === `/chat/${conv._id}`;
                  const isWhatsAppConversation = conv.channel === "whatsapp";
                  return (
                    <SidebarMenuItem key={conv._id}>
                      {(() => {
                        const fallbackTitle = conv.title || t("Chat");
                        const tooltip = isWhatsAppConversation
                          ? `${fallbackTitle} (${t("WhatsApp")})`
                          : fallbackTitle;

                        return (
                          <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
                            <Link href={`/chat/${conv._id}`}>
                              {isWhatsAppConversation && (
                                <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                              )}
                              <span className="truncate">{fallbackTitle}</span>
                              {isWhatsAppConversation && (
                                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                  WA
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        );
                      })()}
                      {conv.channel === "web" && (
                        <SidebarMenuAction onClick={(e) => handleArchive(e, conv._id)} showOnHover>
                          <Archive className="size-4" />
                        </SidebarMenuAction>
                      )}
                    </SidebarMenuItem>
                  );
                })}
                {conversations?.length === 0 && (
                  <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                    <T>No conversations yet</T>
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : mode === "notes" ? (
          <SidebarGroup key="notes" className="animate-slide-in-right">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={goToNav}
                  tooltip={t("Back to navigation")}
                  className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors group-data-[collapsible=icon]:justify-center"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="flex-1 text-center font-medium group-data-[collapsible=icon]:hidden">
                    <T>Notes</T>
                  </span>
                  <span className="size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/notes"}
                    tooltip={t("New note")}
                  >
                    <Link href="/notes">
                      <Plus className="size-4" />
                      <span>
                        <T>New note</T>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={t("New folder")}
                    onClick={() => {
                      setSubfoldingParentId(null);
                      setShowNewFolderForm((prev) => !prev);
                      if (!showNewFolderForm) {
                        setTimeout(() => newFolderInputRef.current?.focus(), 0);
                      }
                    }}
                  >
                    <FolderPlus className="size-4" />
                    <span>
                      <T>New folder</T>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
            {showNewFolderForm && (
              <div className="mx-3 mt-2 flex flex-col gap-2 rounded-lg border p-2">
                {subfoldingParentId && (
                  <span className="text-muted-foreground text-[11px]">
                    <T>Subfolder of {folderTree.folderMap.get(subfoldingParentId)?.name ?? "…"}</T>
                  </span>
                )}
                <input
                  ref={newFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") {
                      setShowNewFolderForm(false);
                      setSubfoldingParentId(null);
                    }
                  }}
                  placeholder={t("Folder name")}
                  className="text-foreground placeholder:text-muted-foreground bg-transparent text-xs outline-none"
                />
                <div className="flex items-center gap-1">
                  <div className="flex flex-1 flex-wrap items-center gap-1">
                    {PRESET_FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewFolderColor(color)}
                        className={cn(
                          "size-3.5 rounded-full transition-transform",
                          newFolderColor === color &&
                            "ring-foreground ring-offset-background scale-110 ring-2 ring-offset-1",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewFolderForm(false);
                      setSubfoldingParentId(null);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
            <div className="mx-3 mt-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2" />
                <input
                  type="text"
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder={t("Search notes…")}
                  className="text-foreground placeholder:text-muted-foreground border-border w-full rounded-md border bg-transparent px-2 py-1 pl-7 text-xs outline-none"
                />
              </div>
            </div>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                {folderTree.roots.length > 0 ? (
                  <>
                    {folderTree.roots.map((folder) => (
                      <FolderTreeItem
                        key={folder._id}
                        folder={folder}
                        notesByFolder={noteGrouping.notesByFolder}
                        collapsedFolders={collapsedFolders}
                        onToggle={toggleFolder}
                        onRenameNote={handleRenameNote}
                        onToggleNotePin={handleToggleNotePin}
                        onMoveNoteToFolder={handleMoveNoteToFolder}
                        onArchiveNote={handleArchiveNote}
                        onDeleteNote={handleDeleteNote}
                        allFolders={flatFolders}
                        onNewSubfolder={handleNewSubfolder}
                        onRename={handleRenameFolder}
                        onMove={setMovingFolderId}
                        onDelete={(id) => void handleDeleteFolder(id)}
                      />
                    ))}
                    {noteGrouping.unfiledNotes.length > 0 && (
                      <Collapsible
                        open={!collapsedFolders.has("unfiled")}
                        onOpenChange={() => toggleFolder("unfiled")}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={t("Unfiled")}>
                              <NotebookText className="size-4" />
                              <span className="truncate">
                                <T>Unfiled</T>
                              </span>
                              <ChevronRight
                                className={cn(
                                  "text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform",
                                  !collapsedFolders.has("unfiled") && "rotate-90",
                                )}
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {noteGrouping.unfiledNotes.map((note) => (
                                <NoteTreeItem
                                  key={note._id}
                                  note={note}
                                  isActive={pathname === `/notes/${note._id}`}
                                  folders={flatFolders}
                                  variant="nested"
                                  onRename={handleRenameNote}
                                  onTogglePin={handleToggleNotePin}
                                  onMoveToFolder={handleMoveNoteToFolder}
                                  onArchive={handleArchiveNote}
                                  onDelete={handleDeleteNote}
                                />
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    )}
                  </>
                ) : (
                  filteredActiveNotes.map((note) => (
                    <NoteTreeItem
                      key={note._id}
                      note={note}
                      isActive={pathname === `/notes/${note._id}`}
                      folders={flatFolders}
                      variant="root"
                      onRename={handleRenameNote}
                      onTogglePin={handleToggleNotePin}
                      onMoveToFolder={handleMoveNoteToFolder}
                      onArchive={handleArchiveNote}
                      onDelete={handleDeleteNote}
                    />
                  ))
                )}
                {filteredActiveNotes.length === 0 && (
                  <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                    {noteSearch.trim() ? <T>No notes match your search</T> : <T>No notes yet</T>}
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
            <MoveFolderDialog
              folderId={movingFolderId}
              folderMap={folderTree.folderMap}
              onClose={() => setMovingFolderId(null)}
            />
            {filteredArchivedNotes.length > 0 ? (
              <>
                <SidebarGroupContent className="mt-4 px-3">
                  <div className="text-muted-foreground text-[11px] font-medium">
                    <T>Archived</T>
                  </div>
                </SidebarGroupContent>
                <SidebarGroupContent className="mt-2">
                  <SidebarMenu>
                    {filteredArchivedNotes.map((note) => (
                      <NoteTreeItem
                        key={note._id}
                        note={note}
                        isActive={pathname === `/notes/${note._id}`}
                        folders={flatFolders}
                        variant="root"
                        onRename={handleRenameNote}
                        onTogglePin={handleToggleNotePin}
                        onMoveToFolder={handleMoveNoteToFolder}
                        onArchive={handleArchiveNote}
                        onDelete={handleDeleteNote}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </>
            ) : null}
            {filteredTrashedNotes.length > 0 ? (
              <>
                <SidebarGroupContent className="mt-4 px-3">
                  <div className="text-muted-foreground flex items-center justify-between text-[11px] font-medium">
                    <span className="flex items-center gap-1">
                      <Trash2 className="size-3" />
                      <T>Trash</T>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEmptyTrashConfirm(true)}
                      className="text-muted-foreground hover:text-foreground text-[10px] transition-colors"
                    >
                      <T>Empty</T>
                    </button>
                  </div>
                </SidebarGroupContent>
                <SidebarGroupContent className="mt-2">
                  <SidebarMenu>
                    {filteredTrashedNotes.map((note) => (
                      <NoteTreeItem
                        key={note._id}
                        note={note}
                        isActive={pathname === `/notes/${note._id}`}
                        folders={flatFolders}
                        variant="root"
                        onRename={handleRenameNote}
                        onTogglePin={handleToggleNotePin}
                        onMoveToFolder={handleMoveNoteToFolder}
                        onArchive={handleArchiveNote}
                        onDelete={handlePermanentlyDeleteNote}
                        onRestore={handleRestoreNote}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </>
            ) : null}
            <AlertDialog open={showEmptyTrashConfirm} onOpenChange={setShowEmptyTrashConfirm}>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <T>Empty trash?</T>
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <T>
                      All {trashedNotes.length} trashed notes will be permanently deleted. This
                      cannot be undone.
                    </T>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="sm">
                    <T>Cancel</T>
                  </AlertDialogCancel>
                  <AlertDialogAction
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleEmptyTrash()}
                  >
                    <T>Empty trash</T>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SidebarGroup>
        ) : (
          <SidebarGroup key="settings" className="animate-slide-in-right">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={goToNav}
                  tooltip={t("Back to navigation")}
                  className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="flex-1 text-center font-medium">
                    <T>Settings</T>
                  </span>
                  <span className="size-4 shrink-0" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/general"}
                    tooltip={t("General")}
                  >
                    <Link href="/settings/general">
                      <SlidersHorizontal className="size-4" />
                      <span>
                        <T>General</T>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/profile"}
                    tooltip={t("Profile")}
                  >
                    <Link href="/settings/profile">
                      <UserCircle className="size-4" />
                      <span>
                        <T>Profile</T>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/integrations"}
                    tooltip={t("Integrations")}
                  >
                    <Link href="/settings/integrations">
                      <Blocks className="size-4" />
                      <span>
                        <T>Integrations</T>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="gap-1 px-3 pb-3">
        <ThemeSwitcher />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
