"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { MessageCircle } from "lucide-react";
import { use } from "react";

import { ChatArea } from "@/components/chat/chat-area";
import Loader from "@/components/loader";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function ChatConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const t = useGT();
  const { conversationId } = use(params);
  const conversation = useQuery(api.conversations.get, {
    id: conversationId as Id<"conversations">,
  });

  if (conversation === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (conversation === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">
          <T>Conversation not found</T>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-border shrink-0 border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger />
          {conversation.channel === "whatsapp" && (
            <MessageCircle className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <h1 className="text-foreground truncate text-sm font-semibold tracking-tight">
            {conversation.title || t("Chat")}
          </h1>
          {conversation.channel === "whatsapp" && (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              <T>WhatsApp</T>
            </span>
          )}
        </div>
      </header>
      <ChatArea conversationId={conversation._id} />
    </div>
  );
}
