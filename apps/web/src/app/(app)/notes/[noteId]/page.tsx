"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { Archive, PenLine, Pin, PinOff, Save } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatArea } from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const updateNote = useMutation(api.notes.update);
  const archiveNote = useMutation(api.notes.archive);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializingThread, setIsInitializingThread] = useState(false);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setContent(note.content);
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
    <PageWrapper title={<T>{title || "Untitled note"}</T>}>
      <div className="grid gap-4 lg:min-h-[calc(100vh-15rem)] lg:grid-cols-[1.2fr_1fr]">
        <div className="min-h-0 overflow-hidden rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            <div className="flex items-center gap-2">
              {note.isPinned ? (
                <Badge variant="outline" className="text-[10px]">
                  <Pin className="size-3" />
                  <T>Pinned</T>
                </Badge>
              ) : null}
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
              <Badge variant="secondary" className="text-[10px]">
                {formatLastUpdated(note.updatedAt)}
              </Badge>
            </div>
          </div>

          <Textarea
            className="h-[45vh] lg:h-[calc(100%-5.5rem)]"
            value={content}
            onChange={(event) => setContent(event.target.value)}
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
