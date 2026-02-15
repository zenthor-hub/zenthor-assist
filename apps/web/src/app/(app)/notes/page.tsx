"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { Archive, FolderKanban, ListFilter, Pin, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
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

type NoteFolder = {
  _id: Id<"noteFolders">;
  name: string;
  color: string;
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

type NoteFilter = "all" | "active" | "archived" | "pinned";
type NoteSort = "updated_desc" | "updated_asc" | "title";

type FolderFilterOption = { id: "all" | Id<"noteFolders">; name: string };

const NOTE_SORT_OPTIONS: Array<{ value: NoteSort; label: string }> = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Oldest updated" },
  { value: "title", label: "Title (A-Z)" },
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

export default function NotesPage() {
  const t = useGT();
  const router = useRouter();
  const [filter, setFilter] = useState<NoteFilter>("active");
  const [sortBy, setSortBy] = useState<NoteSort>("updated_desc");
  const [selectedFolderId, setSelectedFolderId] = useState<"all" | Id<"noteFolders">>("all");

  const [composerTitle, setComposerTitle] = useState("");
  const [composerContent, setComposerContent] = useState("");
  const [composerFolderId, setComposerFolderId] = useState<"none" | Id<"noteFolders">>("none");

  const rawFolders = useQuery(api.noteFolders.list, {});
  const folders = (rawFolders ?? []) as NoteFolder[];
  const queryArgs = useMemo(
    () => ({
      ...(selectedFolderId === "all" ? {} : { folderId: selectedFolderId }),
      ...(filter === "archived" ? { isArchived: true } : { isArchived: false }),
      limit: 200,
    }),
    [filter, selectedFolderId],
  );
  const notes = useQuery(api.notes.list, queryArgs) as NoteItem[] | undefined;

  const createNote = useMutation(api.notes.create);
  const moveNote = useMutation(api.notes.moveToFolder);
  const archiveNote = useMutation(api.notes.archive);
  const folderFilters: FolderFilterOption[] = [
    { id: "all", name: t("All folders") },
    ...folders.map((folder) => ({ id: folder._id, name: folder.name })),
  ];

  const visibleNotes = useMemo(() => {
    const current = notes ?? [];
    const filtered =
      filter === "pinned"
        ? current.filter((note) => note.isPinned)
        : filter === "archived"
          ? current
          : current.filter((note) => !note.isArchived);

    return [...filtered].sort((a, b) => {
      if (sortBy === "updated_asc") return a.updatedAt - b.updatedAt;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, filter, sortBy]);

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

  async function handleMoveNote(noteId: Id<"notes">, folderId: "none" | Id<"noteFolders">) {
    try {
      await moveNote({
        id: noteId,
        folderId: folderId === "none" ? undefined : folderId,
      });
      toast.success(t("Note moved"));
    } catch {
      toast.error(t("Failed to move note"));
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

  if (notes === undefined) {
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
                {folders.map((folder) => (
                  <SelectItem key={folder._id} value={folder._id}>
                    {folder.name}
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

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
        </div>

        <div className="divide-border divide-y rounded-lg border">
          {visibleNotes.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-muted-foreground text-sm">
                <T>No notes match this view.</T>
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
                    {note.content || t("Empty note")}
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
                      {folders.map((folder) => (
                        <SelectItem key={folder._id} value={folder._id}>
                          {folder.name}
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
