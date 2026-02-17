"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  CircleX,
  FolderKanban,
  ListFilter,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { buildFolderTree, flattenTreeWithDepth, getFolderBreadcrumb } from "@/lib/folder-tree";

type NoteFolder = {
  _id: Id<"noteFolders">;
  name: string;
  color: string;
  position: number;
  parentId?: Id<"noteFolders">;
};

type NoteItem = {
  _id: Id<"notes">;
  title: string;
  content: string;
  isPinned?: boolean;
  isArchived: boolean;
  folderId?: Id<"noteFolders">;
  updatedAt: number;
};

type NoteFilter = "all" | "active" | "archived" | "pinned" | "trashed";
type NoteSort = "updated_desc" | "updated_asc" | "title";

type FolderFilterOption = { id: "all" | Id<"noteFolders">; name: string };

const NOTE_SORT_OPTIONS: Array<{ value: NoteSort; label: string }> = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Oldest updated" },
  { value: "title", label: "Title (A-Z)" },
];

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

function normalizeFolderId(value: string): "none" | Id<"noteFolders"> {
  return value === "none" ? "none" : (value as Id<"noteFolders">);
}

function getFolderColor(folders: readonly NoteFolder[], folderId?: Id<"noteFolders">) {
  const folder = folders.find((item) => item._id === folderId);
  return folder?.color || "#94a3b8";
}

function getFolderName(folders: readonly NoteFolder[], folderId?: Id<"noteFolders">) {
  const folder = folders.find((item) => item._id === folderId);
  return folder?.name || "Unfiled";
}

function getNoteDisplayText(content: string) {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function NotesPage() {
  const t = useGT();
  const router = useRouter();
  const [filter, setFilter] = useState<NoteFilter>("active");
  const [sortBy, setSortBy] = useState<NoteSort>("updated_desc");
  const [selectedFolderId, setSelectedFolderId] = useState<"all" | Id<"noteFolders">>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [composerTitle, setComposerTitle] = useState("");
  const [composerContent, setComposerContent] = useState("");
  const [composerFolderId, setComposerFolderId] = useState<"none" | Id<"noteFolders">>("none");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(PRESET_FOLDER_COLORS[0]);
  const [editingFolderId, setEditingFolderId] = useState<Id<"noteFolders"> | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderColor, setEditingFolderColor] = useState(PRESET_FOLDER_COLORS[0]);
  const [deletingFolderId, setDeletingFolderId] = useState<Id<"noteFolders"> | null>(null);

  const rawFolders = useQuery(api.noteFolders.list, {});
  const folders = (rawFolders ?? []) as NoteFolder[];
  const orderedFolders = [...folders].sort((a, b) => a.position - b.position);
  const folderTree = useMemo(
    () => buildFolderTree(folders, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawFolders is stable from useQuery
    [rawFolders],
  );
  const flatFolders = useMemo(() => flattenTreeWithDepth(folderTree.roots), [folderTree]);
  const queryArgs = useMemo(
    () => ({
      ...(selectedFolderId === "all" ? {} : { folderId: selectedFolderId }),
      ...(filter === "archived" ? { isArchived: true } : { isArchived: false }),
      limit: 200,
    }),
    [filter, selectedFolderId],
  );
  const notes = useQuery(api.notes.list, filter === "trashed" ? "skip" : queryArgs) as
    | NoteItem[]
    | undefined;
  const trashedNotes = useQuery(
    api.notes.listTrashed,
    filter === "trashed" ? { limit: 200 } : "skip",
  ) as NoteItem[] | undefined;

  const createNote = useMutation(api.notes.create);
  const moveNote = useMutation(api.notes.moveToFolder);
  const archiveNote = useMutation(api.notes.archive);
  const restoreNoteMutation = useMutation(api.notes.restoreNote);
  const permanentlyDeleteMutation = useMutation(api.notes.permanentlyDelete);
  const emptyTrashMutation = useMutation(api.notes.emptyTrash);
  const createFolder = useMutation(api.noteFolders.create);
  const updateFolder = useMutation(api.noteFolders.update);
  const removeFolder = useMutation(api.noteFolders.remove);
  const reorderFolders = useMutation(api.noteFolders.reorder);
  const folderFilters: FolderFilterOption[] = [
    { id: "all", name: t("All folders") },
    ...orderedFolders.map((folder) => ({ id: folder._id, name: folder.name })),
  ];

  const visibleNotes = useMemo(() => {
    let current: NoteItem[];
    if (filter === "trashed") {
      current = trashedNotes ?? [];
    } else {
      const all = notes ?? [];
      current =
        filter === "pinned"
          ? all.filter((note) => note.isPinned)
          : filter === "archived"
            ? all
            : all.filter((note) => !note.isArchived);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      current = current.filter((note) => note.title.toLowerCase().includes(q));
    }

    return [...current].sort((a, b) => {
      if (sortBy === "updated_asc") return a.updatedAt - b.updatedAt;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, trashedNotes, filter, sortBy, searchQuery]);

  async function handleCreateNote() {
    const title = composerTitle.trim();
    if (!title) {
      toast.error(t("Title is required"));
      return;
    }

    try {
      await createNote({
        title,
        content: composerContent.trim(),
        folderId: composerFolderId === "none" ? undefined : composerFolderId,
      });
      setComposerTitle("");
      setComposerContent("");
      toast.success(t("Note created"));
    } catch {
      toast.error(t("Failed to create note"));
    }
  }

  async function handleMoveNote(
    noteId: Id<"notes">,
    folderId: "none" | Id<"noteFolders">,
    source: "row" | "filter" = "row",
  ) {
    try {
      await moveNote({
        id: noteId,
        folderId: folderId === "none" ? undefined : folderId,
      });
      if (source === "filter") {
        setSelectedFolderId("all");
        setComposerFolderId("none");
      }
      toast.success(t("Note moved"));
    } catch {
      toast.error(t("Failed to move note"));
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      toast.error(t("Folder name is required"));
      return;
    }

    try {
      await createFolder({
        name,
        color: newFolderColor,
      });
      setNewFolderName("");
      toast.success(t("Folder created"));
    } catch {
      toast.error(t("Failed to create folder"));
    }
  }

  function startEditingFolder(folder: NoteFolder) {
    setEditingFolderId(folder._id);
    setEditingFolderName(folder.name);
    setEditingFolderColor(folder.color);
  }

  function cancelFolderEdit() {
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingFolderColor(PRESET_FOLDER_COLORS[0]);
  }

  async function handleUpdateFolder() {
    if (!editingFolderId) return;

    const name = editingFolderName.trim();
    if (!name) {
      toast.error(t("Folder name is required"));
      return;
    }

    try {
      await updateFolder({
        id: editingFolderId,
        name,
        color: editingFolderColor,
      });
      setEditingFolderId(null);
      toast.success(t("Folder updated"));
    } catch {
      toast.error(t("Failed to update folder"));
    }
  }

  async function handleDeleteFolder(folderId: Id<"noteFolders">) {
    try {
      await removeFolder({ id: folderId });
      if (composerFolderId === folderId) {
        setComposerFolderId("none");
      }
      if (selectedFolderId === folderId) {
        setSelectedFolderId("all");
      }
      setDeletingFolderId(null);
      toast.success(t("Folder removed"));
    } catch {
      toast.error(t("Failed to remove folder"));
    }
  }

  async function handleReorderFolder(folderId: Id<"noteFolders">, direction: "up" | "down") {
    if (orderedFolders.length < 2) return;

    const currentIndex = orderedFolders.findIndex((folder) => folder._id === folderId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= orderedFolders.length) return;

    const nextOrder = [...orderedFolders];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];

    try {
      await reorderFolders({ orderedFolderIds: nextOrder.map((folder) => folder._id) });
      toast.success(t("Folders reordered"));
    } catch {
      toast.error(t("Failed to reorder folders"));
    }
  }

  async function handleArchive(noteId: Id<"notes">, isArchived: boolean) {
    try {
      await archiveNote({ id: noteId, isArchived });
      toast.success(isArchived ? t("Note archived") : t("Note restored"));
    } catch {
      toast.error(t("Failed to update note"));
    }
  }

  function handleAiDraft() {
    if (!composerTitle.trim()) {
      toast.error(t("Give the note a title first"));
      return;
    }
    setComposerContent(
      `# ${composerTitle.trim()}\n\n## Context\n- Add a short context for this note.\n\n## Key points\n- \n- \n- \n\n## Summary\n- \n`,
    );
  }

  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);

  async function handleEmptyTrash() {
    try {
      await emptyTrashMutation({});
      toast.success(t("Trash emptied"));
      setShowEmptyTrashConfirm(false);
    } catch {
      toast.error(t("Failed to empty trash"));
    }
  }

  if (filter === "trashed" ? trashedNotes === undefined : notes === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <PageWrapper
      title={<T>Notes</T>}
      actions={
        <Button variant="outline" size="sm" onClick={() => setFilter("active")} className="gap-1.5">
          <ListFilter className="size-3.5" />
          <T>Filter</T>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-muted-foreground text-sm font-medium">
              <T>New note</T>
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleAiDraft} className="gap-1.5">
                <Sparkles className="size-3.5" />
                <T>AI draft this note</T>
              </Button>
              <Button size="sm" onClick={handleCreateNote} className="gap-1.5">
                <Plus className="size-3.5" />
                <T>Create</T>
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <Input
              value={composerTitle}
              onChange={(event) => setComposerTitle(event.target.value)}
              placeholder={t("Note title")}
            />
            <Select
              value={composerFolderId}
              onValueChange={(value) => {
                const normalized = normalizeFolderId(value);
                setComposerFolderId(normalized);
                setSelectedFolderId(normalized === "none" ? "all" : normalized);
              }}
            >
              <SelectTrigger className="w-fit min-w-52">
                <SelectValue placeholder={t("Folder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <T>Unfiled</T>
                </SelectItem>
                {flatFolders.map(({ folder, depth }) => (
                  <SelectItem key={folder._id} value={folder._id}>
                    <span style={{ paddingLeft: `${depth * 12}px` }}>{folder.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={composerContent}
              onChange={(event) => setComposerContent(event.target.value)}
              placeholder={t("Start writing your note...")}
              rows={6}
            />
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-3 text-sm font-medium">
            <T>Manage folders</T>
          </h2>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder={t("New folder name")}
              />
              <Input
                type="color"
                value={newFolderColor}
                onChange={(event) => setNewFolderColor(event.target.value)}
                className="h-9 w-12 cursor-pointer p-1"
              />
              <div className="flex flex-wrap gap-1">
                {PRESET_FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewFolderColor(color)}
                    className={`h-5 w-5 rounded-full border transition ${
                      newFolderColor === color ? "ring-foreground/50 ring-1" : ""
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
              </div>
              <Button onClick={() => void handleCreateFolder()} size="sm" className="gap-1.5">
                <Plus className="size-3.5" />
                <T>Create</T>
              </Button>
            </div>

            <div className="space-y-2">
              {orderedFolders.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  <T>No folders yet. Create one to organize notes.</T>
                </p>
              ) : (
                orderedFolders.map((folder, index) => (
                  <div
                    key={folder._id}
                    className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded border px-2 py-2"
                  >
                    {editingFolderId === folder._id ? (
                      <>
                        <Input
                          value={editingFolderName}
                          onChange={(event) => setEditingFolderName(event.target.value)}
                          className="h-8 w-48"
                        />
                        <Input
                          type="color"
                          value={editingFolderColor}
                          onChange={(event) => setEditingFolderColor(event.target.value)}
                          className="h-8 w-12 cursor-pointer p-1"
                        />
                        <Button size="xs" onClick={() => void handleUpdateFolder()}>
                          <T>Save</T>
                        </Button>
                        <Button size="xs" variant="ghost" onClick={cancelFolderEdit}>
                          <CircleX className="size-3.5" />
                          <T>Cancel</T>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="px-1.5 py-0.5 text-[11px]">
                          <span
                            className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: folder.color }}
                          />
                          {folder.parentId ? (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground">
                                {getFolderBreadcrumb(folderTree.folderMap, folder._id)
                                  .slice(0, -1)
                                  .join(" / ")}
                                {" / "}
                              </span>
                              {folder.name}
                            </span>
                          ) : (
                            folder.name
                          )}
                        </Badge>

                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleReorderFolder(folder._id, "up")}
                            disabled={index === 0}
                          >
                            <ArrowUp className="size-3.5" />
                            <span className="sr-only">
                              <T>Move folder up</T>
                            </span>
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleReorderFolder(folder._id, "down")}
                            disabled={index === orderedFolders.length - 1}
                          >
                            <ArrowDown className="size-3.5" />
                            <span className="sr-only">
                              <T>Move folder down</T>
                            </span>
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => startEditingFolder(folder)}
                          >
                            <T>Edit</T>
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setDeletingFolderId(folder._id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search notes…")}
                className="h-8 w-52 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {folderFilters.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  setSelectedFolderId(folder.id);
                  setComposerFolderId(folder.id === "all" ? "none" : folder.id);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedFolderId === folder.id
                    ? "border-foreground/40 bg-foreground/10"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor:
                      folder.id === "all" ? "#94a3b8" : getFolderColor(folders, folder.id),
                  }}
                />
                {folder.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {filter === "active" ? (
              <FolderKanban className="text-muted-foreground size-3.5" />
            ) : null}
            <Select value={filter} onValueChange={(value) => setFilter(value as NoteFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t("Filter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <T>All</T>
                </SelectItem>
                <SelectItem value="active">
                  <T>Active</T>
                </SelectItem>
                <SelectItem value="pinned">
                  <T>Pinned</T>
                </SelectItem>
                <SelectItem value="archived">
                  <T>Archived</T>
                </SelectItem>
                <SelectItem value="trashed">
                  <T>Trash</T>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as NoteSort)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t("Sort")} />
              </SelectTrigger>
              <SelectContent>
                {NOTE_SORT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <T>{item.label}</T>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filter === "trashed" && visibleNotes.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowEmptyTrashConfirm(true)}
              >
                <Trash2 className="size-3.5" />
                <T>Empty trash</T>
              </Button>
            )}
          </div>
        </div>

        <div className="divide-border divide-y rounded-lg border">
          {visibleNotes.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-muted-foreground text-sm">
                {searchQuery.trim() ? (
                  <T>No notes match your search.</T>
                ) : (
                  <T>No notes match this view.</T>
                )}
              </p>
            </div>
          ) : (
            visibleNotes.map((note) => (
              <div
                key={note._id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/notes/${note._id}`)}
                className="hover:bg-muted/40 focus-visible:bg-muted/40 relative flex cursor-pointer items-start gap-3 px-4 py-3 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{note.title}</h3>
                    {note.isPinned && <Pin className="size-3.5 text-amber-500" />}
                    {note.isArchived && <Archive className="text-muted-foreground size-3.5" />}
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {getNoteDisplayText(note.content) || t("Empty note")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-muted/50 px-1.5 py-0.5 text-[11px]">
                      <span
                        className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: getFolderColor(folders, note.folderId) }}
                      />
                      {getFolderName(folders, note.folderId)}
                    </Badge>
                  </div>
                </div>

                <div
                  className="flex shrink-0 items-center gap-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  {filter === "trashed" ? (
                    <>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          void restoreNoteMutation({ id: note._id }).then(() =>
                            toast.success(t("Note restored")),
                          );
                        }}
                      >
                        <RotateCcw className="size-3" />
                        <T>Restore</T>
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          void permanentlyDeleteMutation({ id: note._id }).then(() =>
                            toast.success(t("Note permanently deleted")),
                          );
                        }}
                      >
                        <Trash2 className="size-3" />
                        <T>Delete</T>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Select
                        value={note.folderId ?? "none"}
                        onValueChange={(target) => {
                          void handleMoveNote(note._id, target as "none" | Id<"noteFolders">);
                        }}
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue placeholder={t("Move")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <T>Unfiled</T>
                          </SelectItem>
                          {flatFolders.map(({ folder, depth }) => (
                            <SelectItem key={folder._id} value={folder._id}>
                              <span style={{ paddingLeft: `${depth * 12}px` }}>{folder.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          void handleArchive(note._id, !note.isArchived);
                        }}
                      >
                        <Archive className="size-3" />
                        {note.isArchived ? <T>Restore</T> : <T>Archive</T>}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={!!deletingFolderId}
        onOpenChange={(open) => !open && setDeletingFolderId(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T>
                Delete "
                {deletingFolderId
                  ? (folders.find((f) => f._id === deletingFolderId)?.name ?? "")
                  : ""}
                "?
              </T>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T>Notes in this folder will become unfiled. Child folders will be moved up.</T>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">
              <T>Cancel</T>
            </AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              variant="destructive"
              onClick={() => deletingFolderId && void handleDeleteFolder(deletingFolderId)}
            >
              <T>Delete</T>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showEmptyTrashConfirm} onOpenChange={setShowEmptyTrashConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <T>Empty trash?</T>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T>All trashed notes will be permanently deleted. This cannot be undone.</T>
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
    </PageWrapper>
  );
}
