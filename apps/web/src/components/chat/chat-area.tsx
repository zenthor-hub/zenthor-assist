"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

import type { MessagePosition } from "./message-bubble";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { ToolApprovalCard } from "./tool-approval-card";
import { TypingIndicator } from "./typing-indicator";

interface ChatAreaProps {
  conversationId: Id<"conversations">;
}

const GROUP_THRESHOLD_MS = 120_000;

interface MessageWithPosition {
  _id: string;
  role: string;
  content: string;
  _creationTime: number;
  toolCalls?: { name: string; input: unknown }[];
  streaming?: boolean;
  position: MessagePosition;
}

function computeMessagePositions(
  messages: {
    _id: string;
    role: string;
    content: string;
    _creationTime: number;
    toolCalls?: { name: string; input: unknown }[];
    streaming?: boolean;
  }[],
): MessageWithPosition[] {
  return messages.map((msg, i) => {
    if (msg.role === "system") {
      return { ...msg, position: "single" as const };
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

    return { ...msg, position };
  });
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const messages = useQuery(api.messages.listByConversation, { conversationId });
  const isProcessing = useQuery(api.agent.isProcessing, { conversationId });
  const pendingApprovals = useQuery(api.toolApprovals.getPendingByConversation, {
    conversationId,
  });
  const sendMessage = useMutation(api.messages.send);
  const scrollRef = useRef<HTMLDivElement>(null);

  const groupedMessages = useMemo(() => {
    if (!messages) return null;
    return computeMessagePositions(
      messages as {
        _id: string;
        role: string;
        content: string;
        _creationTime: number;
        toolCalls?: { name: string; input: unknown }[];
        streaming?: boolean;
      }[],
    );
  }, [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (content: string) => {
    await sendMessage({
      conversationId,
      content,
      channel: "web",
    });
  };

  const hasStreamingMessage = messages?.some((msg) => msg.streaming);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="flex flex-col">
          {groupedMessages?.map((msg) => (
            <div
              key={msg._id}
              className={cn(
                msg.position === "middle" || msg.position === "last" ? "mt-1" : "mt-4 first:mt-0",
              )}
            >
              <MessageBubble
                role={msg.role as "user" | "assistant" | "system"}
                content={msg.content}
                toolCalls={msg.toolCalls}
                streaming={msg.streaming ?? undefined}
                position={msg.position}
              />
            </div>
          ))}
          {pendingApprovals &&
            pendingApprovals.map((approval) => (
              <div key={approval._id} className="mt-4">
                <ToolApprovalCard
                  approvalId={approval._id}
                  toolName={approval.toolName}
                  toolInput={approval.toolInput}
                  status={approval.status}
                />
              </div>
            ))}
          {isProcessing && !hasStreamingMessage && (
            <div className="mt-4">
              <TypingIndicator />
            </div>
          )}
        </div>
      </div>
      <MessageInput onSend={handleSend} />
    </div>
  );
}
