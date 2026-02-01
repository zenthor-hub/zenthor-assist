"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";

interface ChatAreaProps {
  conversationId: Id<"conversations">;
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const messages = useQuery(api.messages.listByConversation, { conversationId });
  const isProcessing = useQuery(api.agent.isProcessing, { conversationId });
  const sendMessage = useMutation(api.messages.send);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        <div className="flex flex-col gap-4">
          {messages?.map((msg) => (
            <MessageBubble
              key={msg._id}
              role={msg.role}
              content={msg.content}
              toolCalls={msg.toolCalls as { name: string; input: unknown }[] | undefined}
              streaming={msg.streaming ?? undefined}
            />
          ))}
          {isProcessing && !hasStreamingMessage && <TypingIndicator />}
        </div>
      </div>
      <MessageInput onSend={handleSend} />
    </div>
  );
}
