"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { Archive, PenLine, Pin, PinOff, Save } from "lucide-react";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatArea } from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { NoteEditor } from "@/components/notes/note-editor";
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
};

function getFolderName(folders: FolderItem[], folderId?: Id<"noteFolders">) {
  return folders.find((folder) => folder._id === folderId)?.name ?? "Unfiled";
}

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
  const folders = useQuery(api.noteFolders.list, {}) ?? [];
  const ensureThread = useMutation(api.notes.ensureThread);
  const sendToNoteChat = useMutation(api.messages.send);
  const updateNote = useMutation(api.notes.update);
  const archiveNote = useMutation(api.notes.archive);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<"none" | Id<"noteFolders">>("none");
  const [isPinned, setIsPinned] = useState(false);
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializingThread, setIsInitializingThread] = useState(false);
  const hasHydrated = useRef(false);

  const chatQuickActionTemplate = useCallback(
    (action: "summarize" | "rewrite" | "expand" | "extract", selectedText: string) => {
      const snippet =
        selectedText.length > 800 ? `${selectedText.slice(0, 800)}…` : selectedText.trim();
      const titlePrefix = `Selected section in note “${title || note?.title || t("Untitled note")}”:`;

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

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setContent(note.content);
    setSelectedFolderId(note.folderId ?? "none");
    setIsPinned(note.isPinned === true);
    hasHydrated.current = false;
    if (note.conversationId) setConversationId(note.conversationId);
  }, [note]);

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

  useEffect(() => {
    if (!note) return;
    if (hasHydrated.current) {
      const timer = window.setTimeout(async () => {
        if (note.title === title && note.content === content) return;
        setIsSaving(true);
        try {
          await updateNote({
            id: note._id,
            title,
            content,
          });
        } catch {
          toast.error(t("Failed to save note"));
        } finally {
          setIsSaving(false);
        }
      }, 600);
      return () => {
        window.clearTimeout(timer);
      };
    }
    hasHydrated.current = true;
    return undefined;
  }, [content, note, t, title, updateNote]);

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

  function formatAiActionAt(timestamp?: number) {
    if (!timestamp) return null;
    const delta = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
    return delta < 60
      ? t("AI updated {{mins}}m ago", { mins: `${delta}` })
      : t("AI updated {{hours}}h ago", { hours: `${Math.floor(delta / 60)}` });
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
    <PageWrapper title={<T>{title || "Untitled note"}</T>}>
      <div className="grid gap-4 lg:min-h-[calc(100vh-15rem)] lg:grid-cols-[1.2fr_1fr]">
        <div className="min-h-0 overflow-hidden rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            <div className="flex items-center gap-2">
              <Select
                value={selectedFolderId}
                onValueChange={(value) => updateFolder(value as "none" | Id<"noteFolders">)}
              >
                <SelectTrigger className="w-40">
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
              <Badge
                variant="outline"
                className="max-w-40 gap-1 text-[10px] text-nowrap"
                style={{ borderColor: getFolderColor(folders, note.folderId) }}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: getFolderColor(folders, note.folderId) }}
                />
                {getFolderName(folders, note.folderId)}
              </Badge>
              {note.source ? (
                <Badge variant="outline" className="text-[10px] text-nowrap">
                  {note.source}
                </Badge>
              ) : null}
              {isPinned ? (
                <Badge variant="outline" className="text-[10px]">
                  <Pin className="size-3" />
                  <T>Pinned</T>
                </Badge>
              ) : null}
              {note.lastAiModel ? (
                <Badge variant="outline" className="text-[10px] text-nowrap">
                  {note.lastAiModel}
                </Badge>
              ) : null}
              <Badge variant="secondary" className="text-[10px]">
                {formatLastUpdated(note.updatedAt)}
              </Badge>
              <span className="text-muted-foreground text-[10px]">
                {formatAiActionAt(note.lastAiActionAt)}
              </span>
            </div>
          </div>

          <NoteEditor
            className="h-[45vh] lg:h-[calc(100%-5.5rem)]"
            value={content}
            onChange={setContent}
            onAiAction={handleSectionAiAction}
            placeholder={t("Write your note")}
          />

          <div className="mt-3 flex items-center gap-2">
            <Button size="xs" disabled={isSaving}>
              <Save className="size-3.5" />
              {isSaving ? <T>Saving...</T> : <T>Saved</T>}
            </Button>
            <Button size="xs" variant="outline" onClick={toggleArchive}>
              {note.isArchived ? (
                <>
                  <PinOff className="size-3.5" />
                  <T>Restore</T>
                </>
              ) : (
                <>
                  <Archive className="size-3.5" />
                  <T>Archive</T>
                </>
              )}
            </Button>
            <Button size="xs" variant="outline" onClick={togglePin}>
              <Pin className="size-3.5" />
              {isPinned ? <T>Unpin</T> : <T>Pin</T>}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setTitle(`${title || t("Untitled note")} (AI draft)`);
                setContent("");
              }}
            >
              <PenLine className="size-3.5" />
              <T>AI draft this note</T>
            </Button>
          </div>
        </div>

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
