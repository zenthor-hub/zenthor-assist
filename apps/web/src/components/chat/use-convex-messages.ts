"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useGT } from "gt-next";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { logWebClientEvent } from "@/lib/observability/client";

const GROUP_THRESHOLD_MS = 120_000;

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
  const rawMessages = useQuery(api.messages.listByConversationWindow, {
    conversationId,
    ...(options?.noteId ? { noteId: options.noteId } : {}),
  });
  const isProcessing = useQuery(api.agent.isProcessing, { conversationId });
  const rawApprovals = useQuery(api.toolApprovals.getPendingByConversation, { conversationId });
  const rawPreferences = useQuery(api.userPreferences.get);
  const sendMutation = useMutation(api.messages.send);

  const messages = useMemo(() => {
    if (!rawMessages) return null;
    return computePositions(
      (rawMessages as RawMessage[]).map(
        (msg): RawMessage => ({
          ...msg,
          role: msg.role,
          _id: msg._id,
          content: msg.content,
        }),
      ),
    );
  }, [rawMessages]);

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
    () => (rawMessages as RawMessage[] | undefined)?.some((msg) => msg.streaming) ?? false,
    [rawMessages],
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
    sendMessage,
  };
}
