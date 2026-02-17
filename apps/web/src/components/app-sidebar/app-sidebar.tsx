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
  Sparkles,
  SlidersHorizontal,
  UserCircle,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { toast } from "sonner";

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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { buildFolderTree } from "@/lib/folder-tree";
import { cn } from "@/lib/utils";

import { FolderTreeItem } from "./folder-tree-item";
import { MoveFolderDialog } from "./move-folder-dialog";
import { NavUser } from "./nav-user";
import { ThemeSwitcher } from "./theme-switcher";

type SidebarMode = "nav" | "chats" | "notes" | "settings";

interface SidebarConversation {
  _id: string;
  _creationTime: number;
  channel: "web" | "whatsapp" | "telegram";
  title?: string;
}

interface SidebarNote {
  _id: string;
  _creationTime: number;
  title?: string;
  isArchived: boolean;
  folderId?: string;
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
  const archiveConversation = useMutation(api.conversations.archive);
  const archiveNote = useMutation(api.notes.archive);
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
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const folderTree = useMemo(
    () => buildFolderTree(folders, activeNotes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folders/activeNotes refs from useQuery
    [folders, activeNotes],
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
    for (const [folderId, folderNotes] of folderTree.notesByFolder) {
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
  }, [pathname, folderTree]);

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

  async function handleArchiveNote(e: React.MouseEvent, noteId: string, isArchived: boolean) {
    e.preventDefault();
    e.stopPropagation();

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
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                {folderTree.roots.length > 0 ? (
                  <>
                    {folderTree.roots.map((folder) => (
                      <FolderTreeItem
                        key={folder._id}
                        folder={folder}
                        notesByFolder={folderTree.notesByFolder}
                        collapsedFolders={collapsedFolders}
                        onToggle={toggleFolder}
                        onArchiveNote={(e, noteId) => handleArchiveNote(e, noteId, true)}
                        onNewSubfolder={handleNewSubfolder}
                        onRename={handleRenameFolder}
                        onMove={setMovingFolderId}
                        onDelete={(id) => void handleDeleteFolder(id)}
                      />
                    ))}
                    {folderTree.unfiledNotes.length > 0 && (
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
                              {folderTree.unfiledNotes.map((note) => {
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
                                      onClick={(e) => handleArchiveNote(e, note._id, true)}
                                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-0.5 right-1 flex size-5 items-center justify-center rounded-md opacity-0 group-focus-within/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100"
                                    >
                                      <Archive className="size-3" />
                                    </button>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    )}
                  </>
                ) : (
                  activeNotes.map((note) => {
                    const isActive = pathname === `/notes/${note._id}`;
                    const noteTitle = note.title || t("Untitled note");
                    return (
                      <SidebarMenuItem key={note._id}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={noteTitle}>
                          <Link href={`/notes/${note._id}`}>
                            <NotebookText className="size-4" />
                            <span className="truncate">{noteTitle}</span>
                          </Link>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          onClick={(e) => handleArchiveNote(e, note._id, true)}
                          showOnHover
                        >
                          <Archive className="size-4" />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    );
                  })
                )}
                {activeNotes.length === 0 && (
                  <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                    <T>No notes yet</T>
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
            <MoveFolderDialog
              folderId={movingFolderId}
              folderMap={folderTree.folderMap}
              onClose={() => setMovingFolderId(null)}
            />
            {archivedNotes.length > 0 ? (
              <>
                <SidebarGroupContent className="mt-4 px-3">
                  <div className="text-muted-foreground text-[11px] font-medium">
                    <T>Archived</T>
                  </div>
                </SidebarGroupContent>
                <SidebarGroupContent className="mt-2">
                  <SidebarMenu>
                    {archivedNotes.map((note) => {
                      const isActive = pathname === `/notes/${note._id}`;
                      const tooltip = note.title || t("Untitled note");

                      return (
                        <SidebarMenuItem key={note._id}>
                          <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
                            <Link href={`/notes/${note._id}`}>
                              <NotebookText className="size-4" />
                              <span className="truncate">{tooltip}</span>
                            </Link>
                          </SidebarMenuButton>
                          <SidebarMenuAction
                            onClick={(e) => handleArchiveNote(e, note._id, false)}
                            showOnHover
                          >
                            <Archive className="size-4" />
                          </SidebarMenuAction>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </>
            ) : null}
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
