"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import {
  AlertCircle,
  Archive,
  Check,
  Loader2,
  MoreHorizontal,
  PenLine,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatArea } from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { NoteEditor, type NoteEditorHandle } from "@/components/notes/note-editor";
import { normalizeEditorMarkup } from "@/components/notes/note-editor-utils";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildFolderTree, flattenTreeWithDepth } from "@/lib/folder-tree";

type NoteItem = {
  _id: Id<"notes">;
  title: string;
  content: string;
  folderId?: Id<"noteFolders">;
  isPinned?: boolean;
  isArchived: boolean;
  conversationId?: Id<"conversations">;
  updatedAt: number;
  source?: string;
  lastAiActionAt?: number;
  lastAiModel?: string;
};

type FolderItem = {
  _id: Id<"noteFolders">;
  name: string;
  color: string;
  parentId?: Id<"noteFolders">;
  position: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function getFolderColor(folders: FolderItem[], folderId?: Id<"noteFolders">) {
  return folders.find((folder) => folder._id === folderId)?.color ?? "#94a3b8";
}

export default function NoteWorkspacePage({ params }: { params: Promise<{ noteId: string }> }) {
  const t = useGT();
  const { noteId } = use(params);
  const note = useQuery(api.notes.get, { id: noteId as Id<"notes"> }) as
    | NoteItem
    | null
    | undefined;
  const rawFolders = useQuery(api.noteFolders.list, {});
  const folders = (rawFolders ?? []) as FolderItem[];
  const flatFolders = useMemo(() => {
    const tree = buildFolderTree(folders, []);
    return flattenTreeWithDepth(tree.roots);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawFolders is stable from useQuery
  }, [rawFolders]);
  const ensureThread = useMutation(api.notes.ensureThread);
  const sendToNoteChat = useMutation(api.messages.send);
  const updateNote = useMutation(api.notes.update);
  const archiveNote = useMutation(api.notes.archive);

  const editorRef = useRef<NoteEditorHandle>(null);
  const [title, setTitle] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<"none" | Id<"noteFolders">>("none");
  const [isPinned, setIsPinned] = useState(false);
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirtyTick, setDirtyTick] = useState(0);
  const [isInitializingThread, setIsInitializingThread] = useState(false);

  const hasUnsavedChanges = useRef(false);
  const hydratedNoteId = useRef<string | null>(null);
  const editVersion = useRef(0);
  const lastAiActionAt = useRef<number | undefined>(undefined);

  const handleDirty = useCallback(() => {
    editVersion.current++;
    hasUnsavedChanges.current = true;
    setDirtyTick((n) => n + 1);
  }, []);

  const chatQuickActionTemplate = useCallback(
    (action: "summarize" | "rewrite" | "expand" | "extract", selectedText: string) => {
      const snippet =
        selectedText.length > 800 ? `${selectedText.slice(0, 800)}…` : selectedText.trim();
      const titlePrefix = `Selected section in note "${title || note?.title || t("Untitled note")}":`;

      if (action === "summarize") {
        return `${titlePrefix}

Please summarize this section for quick reading:

${snippet}

Reply with concise bullets and practical next actions.`;
      }
      if (action === "rewrite") {
        return `${titlePrefix}

Please rewrite this section to make it clearer and more concise:

${snippet}`;
      }
      if (action === "expand") {
        return `${titlePrefix}

Please expand this section with concrete examples and structure:

${snippet}`;
      }
      return `${titlePrefix}

Please extract concrete action items and tasks from this section:

${snippet}`;
    },
    [note?.title, t, title],
  );

  const handleSectionAiAction = useCallback(
    async (action: "summarize" | "rewrite" | "expand" | "extract", selectedText: string) => {
      if (!note || !conversationId) {
        toast.error(t("Conversation is not ready yet"));
        return;
      }

      try {
        await sendToNoteChat({
          conversationId,
          channel: "web",
          content: chatQuickActionTemplate(action, selectedText),
          noteId: note._id,
        });
        toast.success(t("Sent to note AI assistant"));
      } catch {
        toast.error(t("Failed to send note section to AI"));
      }
    },
    [conversationId, note, sendToNoteChat, chatQuickActionTemplate, t],
  );

  // Hydrate editor from server state
  useEffect(() => {
    if (!note) return;

    // Always sync conversationId when it appears from the server
    if (note.conversationId) setConversationId(note.conversationId);

    const isNewNote = hydratedNoteId.current !== note._id;

    if (isNewNote) {
      // Full hydration for a different note
      hydratedNoteId.current = note._id;
      hasUnsavedChanges.current = false;
      lastAiActionAt.current = note.lastAiActionAt;
      setTitle(note.title);
      setSelectedFolderId(note.folderId ?? "none");
      setIsPinned(note.isPinned === true);
      editorRef.current?.setContent(note.content);
      return;
    }

    // Same note — sync metadata
    setSelectedFolderId(note.folderId ?? "none");
    setIsPinned(note.isPinned === true);

    // Detect external AI patch
    if (note.lastAiActionAt !== lastAiActionAt.current && !hasUnsavedChanges.current) {
      lastAiActionAt.current = note.lastAiActionAt;
      setTitle(note.title);
      editorRef.current?.setContent(note.content);
    }
  }, [note]);

  // Ensure conversation thread exists
  useEffect(() => {
    if (!note || conversationId || note.conversationId) return;
    let cancelled = false;

    const createThread = async () => {
      setIsInitializingThread(true);
      try {
        const id = await ensureThread({ id: note._id });
        if (!cancelled) setConversationId(id);
      } catch {
        if (!cancelled) {
          toast.error(t("Failed to connect a note chat"));
        }
      } finally {
        if (!cancelled) setIsInitializingThread(false);
      }
    };

    void createThread();
    return () => {
      cancelled = true;
    };
  }, [conversationId, ensureThread, note, t]);

  // Autosave with debounce
  useEffect(() => {
    if (!note || !hasUnsavedChanges.current) return;

    const timer = window.setTimeout(async () => {
      const nextContent = normalizeEditorMarkup(editorRef.current?.getContent() ?? "");
      const currentContent = normalizeEditorMarkup(note.content);

      if (note.title === title && currentContent === nextContent) {
        hasUnsavedChanges.current = false;
        return;
      }

      setSaveState("saving");
      const versionAtSave = editVersion.current;
      try {
        await updateNote({
          id: note._id,
          title,
          content: nextContent,
        });
        if (editVersion.current === versionAtSave) {
          hasUnsavedChanges.current = false;
        }
        setSaveState("saved");
        // Auto-clear "saved" after 3s
        window.setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, 3000);
      } catch {
        toast.error(t("Failed to save note"));
        setSaveState("error");
      }
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dirtyTick, note, t, title, updateNote]);

  async function toggleArchive() {
    if (!note) return;
    try {
      await archiveNote({ id: note._id, isArchived: !note.isArchived });
      toast.success(note.isArchived ? t("Note restored") : t("Note archived"));
    } catch {
      toast.error(t("Failed to update note"));
    }
  }

  async function updateFolder(folderId: "none" | Id<"noteFolders">) {
    if (!note) return;
    const nextFolderId = folderId === "none" ? undefined : folderId;
    try {
      await updateNote({ id: note._id, folderId: nextFolderId });
      setSelectedFolderId(folderId);
      toast.success(t("Note folder updated"));
    } catch {
      toast.error(t("Failed to update note folder"));
    }
  }

  async function togglePin() {
    if (!note) return;
    const nextPinned = !isPinned;
    try {
      await updateNote({ id: note._id, isPinned: nextPinned });
      setIsPinned(nextPinned);
      toast.success(nextPinned ? t("Note pinned") : t("Note unpinned"));
    } catch {
      toast.error(t("Failed to update note"));
    }
  }

  function formatLastUpdated(timestamp: number) {
    const ago = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
    return ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
  }

  if (note === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (note === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">
          <T>Note not found</T>
        </p>
      </div>
    );
  }

  const chatNoteContext = { noteId: note._id, title: title || note.title };

  return (
    <PageWrapper
      title={<T>{title || "Untitled note"}</T>}
      fillHeight
      actions={
        <div className="flex items-center gap-1">
          {saveState !== "idle" && (
            <span className="text-muted-foreground mr-2 flex items-center gap-1 text-xs">
              {saveState === "saving" && <Loader2 className="size-3 animate-spin" />}
              {saveState === "saved" && <Check className="size-3 text-emerald-500" />}
              {saveState === "error" && <AlertCircle className="text-destructive size-3" />}
              <span>
                {saveState === "saving" && <T>Saving</T>}
                {saveState === "saved" && <T>Saved</T>}
                {saveState === "error" && <T>Failed</T>}
              </span>
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="ghost" onClick={togglePin}>
                {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPinned ? <T>Unpin note</T> : <T>Pin note</T>}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="ghost" onClick={toggleArchive}>
                <Archive className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {note.isArchived ? <T>Restore note</T> : <T>Archive note</T>}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  editVersion.current++;
                  hasUnsavedChanges.current = true;
                  setTitle(`${title || t("Untitled note")} (AI draft)`);
                  editorRef.current?.setContent("");
                  setDirtyTick((n) => n + 1);
                }}
              >
                <PenLine className="size-3.5" />
                <T>AI draft this note</T>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ── Editor panel ── */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* Title + metadata */}
          <div>
            <input
              value={title}
              onChange={(event) => {
                editVersion.current++;
                hasUnsavedChanges.current = true;
                setTitle(event.target.value);
                setDirtyTick((n) => n + 1);
              }}
              className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-lg font-semibold tracking-tight outline-none"
              placeholder={t("Untitled note")}
            />

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <Select
                value={selectedFolderId}
                onValueChange={(value) => updateFolder(value as "none" | Id<"noteFolders">)}
              >
                <SelectTrigger className="hover:text-foreground h-5 w-auto gap-1.5 border-none bg-transparent px-0 text-[11px] shadow-none [&_svg:last-child]:size-3">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: getFolderColor(
                        folders,
                        selectedFolderId === "none" ? undefined : selectedFolderId,
                      ),
                    }}
                  />
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

              {note.source && (
                <>
                  <span className="text-border">·</span>
                  <span>{note.source}</span>
                </>
              )}

              <span className="text-border">·</span>
              <span>{formatLastUpdated(note.updatedAt)}</span>

              {note.lastAiModel && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-2.5" />
                    {note.lastAiModel}
                  </span>
                </>
              )}

              {isPinned && (
                <>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <Pin className="size-2.5" />
                    <T>Pinned</T>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Editor */}
          <NoteEditor
            ref={editorRef}
            className="min-h-0 flex-1"
            initialContent={note.content}
            onDirty={handleDirty}
            onAiAction={handleSectionAiAction}
            placeholder={t("Write your note")}
          />
        </div>

        {/* ── Chat panel ── */}
        <div className="min-h-0 overflow-hidden rounded-lg border">
          {isInitializingThread ? (
            <div className="flex min-h-full items-center justify-center">
              <Loader />
            </div>
          ) : conversationId ? (
            <ChatArea conversationId={conversationId} noteContext={chatNoteContext} />
          ) : (
            <div className="flex min-h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">
                <T>Note chat is unavailable.</T>
              </p>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
