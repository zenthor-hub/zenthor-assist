"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useGT } from "gt-next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { logWebClientEvent } from "@/lib/observability/client";

const GROUP_THRESHOLD_MS = 120_000;
const MESSAGE_WINDOW_LIMIT = 120;

type MessagePosition = "first" | "middle" | "last" | "single";

interface ChatMessage {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  _creationTime: number;
  noteId?: string;
  toolCalls?: { name: string; input: unknown; output?: unknown }[];
  modelUsed?: string;
  streaming?: boolean;
  status?: "pending" | "sent" | "delivered" | "failed";
  position: MessagePosition;
}

export interface PendingApproval {
  _id: string;
  toolName: string;
  toolInput: unknown;
  status: "pending" | "approved" | "rejected";
}

interface NoteThreadContext {
  noteId: Id<"notes">;
  title: string;
}

interface UseConvexMessagesOptions {
  noteId?: Id<"notes">;
  noteTitle?: string;
}

interface RawMessage {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  _creationTime: number;
  noteId?: Id<"notes">;
  toolCalls?: { name: string; input: unknown; output?: unknown }[];
  modelUsed?: string;
  streaming?: boolean;
  status?: "pending" | "sent" | "delivered" | "failed";
}

interface RawApproval {
  _id: string;
  toolName: string;
  toolInput: unknown;
  status: "pending" | "approved" | "rejected";
}

function computePositions(
  messages: {
    _id: string;
    role: string;
    content: string;
    _creationTime: number;
    noteId?: string;
    toolCalls?: { name: string; input: unknown; output?: unknown }[];
    modelUsed?: string;
    streaming?: boolean;
    status?: "pending" | "sent" | "delivered" | "failed";
  }[],
): ChatMessage[] {
  return messages.map((msg, i) => {
    if (msg.role === "system") {
      return { ...msg, role: msg.role, position: "single" as const };
    }

    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    const sameRoleAsPrev =
      prev !== null &&
      prev.role !== "system" &&
      prev.role === msg.role &&
      msg._creationTime - prev._creationTime < GROUP_THRESHOLD_MS;

    const sameRoleAsNext =
      next !== null &&
      next.role !== "system" &&
      next.role === msg.role &&
      next._creationTime - msg._creationTime < GROUP_THRESHOLD_MS;

    let position: MessagePosition;
    if (sameRoleAsPrev && sameRoleAsNext) {
      position = "middle";
    } else if (sameRoleAsPrev) {
      position = "last";
    } else if (sameRoleAsNext) {
      position = "first";
    } else {
      position = "single";
    }

    return { ...msg, role: msg.role as ChatMessage["role"], position };
  });
}

export function useConvexMessages(
  conversationId: Id<"conversations">,
  options?: UseConvexMessagesOptions,
) {
  const t = useGT();
  const [latestMessages, setLatestMessages] = useState<RawMessage[]>([]);
  const [historicalMessages, setHistoricalMessages] = useState<RawMessage[]>([]);
  const [fetchMode, setFetchMode] = useState<"latest" | "older">("latest");
  const [historicalCursor, setHistoricalCursor] = useState<Id<"messages"> | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  useEffect(() => {
    setLatestMessages([]);
    setHistoricalMessages([]);
    setFetchMode("latest");
    setHistoricalCursor(null);
    setIsLoadingHistory(false);
    setHasMoreMessages(false);
  }, [conversationId, options?.noteId]);

  const messageQueryArgs = useMemo(() => {
    return {
      conversationId,
      ...(options?.noteId ? { noteId: options.noteId } : {}),
      limit: MESSAGE_WINDOW_LIMIT,
      ...(fetchMode === "older" && historicalCursor ? { beforeMessageId: historicalCursor } : {}),
    };
  }, [conversationId, fetchMode, historicalCursor, options?.noteId]);

  const rawMessages = useQuery(api.messages.listByConversationWindow, messageQueryArgs);
  const isProcessing = useQuery(api.agent.isProcessing, { conversationId });
  const rawApprovals = useQuery(api.toolApprovals.getPendingByConversation, { conversationId });
  const rawPreferences = useQuery(api.userPreferences.get);
  const sendMutation = useMutation(api.messages.send);

  useEffect(() => {
    if (!rawMessages) return;
    const page = rawMessages as RawMessage[];

    if (fetchMode === "older" && historicalCursor) {
      setHistoricalMessages((previous) => {
        const mergedMessages = new Map<string, RawMessage>();

        for (const message of [...page, ...previous]) {
          mergedMessages.set(message._id, message);
        }

        return [...mergedMessages.values()].sort((a, b) => a._creationTime - b._creationTime);
      });
      setHasMoreMessages(page.length === MESSAGE_WINDOW_LIMIT);
      setFetchMode("latest");
      setHistoricalCursor(null);
      setIsLoadingHistory(false);
      return;
    }

    setLatestMessages(page);
    setHasMoreMessages(page.length === MESSAGE_WINDOW_LIMIT);
  }, [fetchMode, historicalCursor, rawMessages]);

  const messagesSource = useMemo(() => {
    const mergedMessages = new Map<string, RawMessage>();

    for (const message of [...historicalMessages, ...latestMessages]) {
      mergedMessages.set(message._id, message);
    }

    return [...mergedMessages.values()].sort((a, b) => a._creationTime - b._creationTime);
  }, [historicalMessages, latestMessages]);

  const canLoadOlderMessages =
    hasMoreMessages && messagesSource.length > 0 && !isLoadingHistory && fetchMode !== "older";

  const loadOlderMessages = useCallback(() => {
    if (!canLoadOlderMessages) return;
    const oldestMessage = messagesSource.at(0);
    if (!oldestMessage) return;

    setIsLoadingHistory(true);
    setFetchMode("older");
    setHistoricalCursor(oldestMessage._id as Id<"messages">);
  }, [canLoadOlderMessages, messagesSource]);

  const messages = useMemo(() => {
    if (messagesSource.length === 0) return null;
    return computePositions(
      messagesSource.map(
        (msg): RawMessage => ({
          ...msg,
          role: msg.role,
          _id: msg._id,
          content: msg.content,
        }),
      ),
    );
  }, [messagesSource]);

  const preferences = useMemo(
    () =>
      rawPreferences
        ? {
            showModelInfo: rawPreferences.showModelInfo ?? false,
            showToolDetails: rawPreferences.showToolDetails ?? false,
          }
        : null,
    [rawPreferences],
  );

  const hasStreamingMessage = useMemo(
    () => messagesSource.some((msg) => msg.streaming),
    [messagesSource],
  );

  const pendingApprovals: PendingApproval[] = useMemo(
    () =>
      (rawApprovals ?? []).map((a: RawApproval) => ({
        _id: a._id,
        toolName: a.toolName,
        toolInput: a.toolInput,
        status: a.status,
      })),
    [rawApprovals],
  );

  const noteContext: NoteThreadContext | null = useMemo(() => {
    if (!options?.noteId) return null;
    return {
      noteId: options.noteId,
      title: options.noteTitle ?? "Note",
    };
  }, [options?.noteId, options?.noteTitle]);

  const sendMessage = useCallback(
    async (content: string) => {
      try {
        await sendMutation({
          conversationId,
          content,
          channel: "web",
          ...(noteContext ? { noteId: noteContext.noteId } : {}),
        });
      } catch (error) {
        toast.error(t("Failed to send message"));
        logWebClientEvent({
          event: "web.chat.send.failed",
          level: "error",
          payload: {
            conversationId,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                  }
                : String(error),
          },
        });
      }
    },
    [conversationId, noteContext, sendMutation, t],
  );

  return {
    messages,
    isProcessing: isProcessing ?? false,
    hasStreamingMessage,
    pendingApprovals,
    preferences,
    noteContext,
    hasMoreMessages,
    isLoadingHistory,
    loadOlderMessages,
    sendMessage,
  };
}
