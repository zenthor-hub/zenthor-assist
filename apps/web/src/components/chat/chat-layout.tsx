"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@gbarros-assistant/backend/convex/_generated/api";
import type { Id } from "@gbarros-assistant/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState, useEffect } from "react";

import Loader from "@/components/loader";

import { ChatArea } from "./chat-area";
import { ConversationList } from "./conversation-list";

export function ChatLayout() {
  const { user } = useUser();
  const getOrCreateUser = useMutation(api.users.getOrCreateFromClerk);
  const getOrCreateConversation = useMutation(api.conversations.getOrCreate);

  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function init() {
      const uId = await getOrCreateUser({
        externalId: user!.id,
        name: user!.fullName || user!.firstName || "User",
        email: user!.primaryEmailAddress?.emailAddress,
        image: user!.imageUrl,
      });
      setUserId(uId);

      const convId = await getOrCreateConversation({
        userId: uId,
        channel: "web",
      });
      setConversationId(convId);
      setLoading(false);
    }

    init();
  }, [user, getOrCreateUser, getOrCreateConversation]);

  if (loading || !userId || !conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <div className="border-b p-3 text-sm font-medium">Conversations</div>
        <ConversationList
          userId={userId}
          activeConversationId={conversationId}
          onSelect={setConversationId}
        />
      </aside>
      <main className="flex-1">
        <ChatArea conversationId={conversationId} />
      </main>
    </div>
  );
}
