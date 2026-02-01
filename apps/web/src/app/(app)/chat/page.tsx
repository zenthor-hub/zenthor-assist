"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { MessageSquare, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAppContext } from "@/hooks/use-app-context";

export default function ChatPage() {
  const { userId } = useAppContext();
  const createConversation = useMutation(api.conversations.create);
  const router = useRouter();

  async function handleNewChat() {
    const id = await createConversation({ userId });
    router.push(`/chat/${id}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="bg-background/90 border-border shrink-0 border-b px-4 py-4 backdrop-blur-sm lg:px-6">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger />
          <h1 className="text-foreground truncate text-lg font-semibold tracking-tight">Chats</h1>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <MessageSquare className="text-muted-foreground size-12" />
        <p className="text-muted-foreground text-sm">No conversation selected</p>
        <Button onClick={handleNewChat}>
          <Plus className="size-4" />
          Start a new chat
        </Button>
      </div>
    </div>
  );
}
