"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { MessageSquare, Plus } from "lucide-react";
import Link from "next/link";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/hooks/use-app-context";

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Dashboard() {
  const { userId } = useAppContext();
  const conversations = useQuery(api.conversations.listRecentWithLastMessage, { userId });

  if (conversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  const totalConversations = conversations.length;
  const totalWithMessages = conversations.filter((c) => c.lastMessage !== null).length;

  return (
    <PageWrapper
      title="Dashboard"
      actions={
        <Button asChild size="sm">
          <Link href="/chat">
            <Plus className="size-4" />
            New chat
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-muted-foreground text-sm">Conversations</p>
            <p className="text-2xl font-semibold">{totalConversations}</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-muted-foreground text-sm">With messages</p>
            <p className="text-2xl font-semibold">{totalWithMessages}</p>
          </div>
        </div>

        <div>
          <h2 className="text-muted-foreground mb-3 text-sm font-medium">Recent conversations</h2>
          {conversations.length === 0 ? (
            <div className="bg-muted/50 flex flex-col items-center justify-center gap-2 rounded-xl py-12">
              <MessageSquare className="text-muted-foreground size-8" />
              <p className="text-muted-foreground text-sm">No conversations yet</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/chat">Start a conversation</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-border divide-y rounded-xl border">
              {conversations.map((conv) => (
                <Link
                  key={conv._id}
                  href={`/chat/${conv._id}` as "/"}
                  className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conv.title || "Chat"}</p>
                    {conv.lastMessage && (
                      <p className="text-muted-foreground truncate text-xs">
                        {conv.lastMessage.role === "assistant" ? "Assistant: " : ""}
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatRelativeTime(conv.lastMessage.createdAt)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
