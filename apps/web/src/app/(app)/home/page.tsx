"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { MessageCircle, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";

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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { user } = useUser();
  const conversations = useQuery(api.conversations.listRecentWithLastMessage, {});

  if (conversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  const firstName = user?.firstName ?? "there";
  const totalConversations = conversations.length;
  const totalWithMessages = conversations.filter((c) => c.lastMessage !== null).length;

  return (
    <PageWrapper
      title="Home"
      actions={
        <Button asChild size="sm">
          <Link href="/chat/overview">
            <Plus className="size-4" />
            New chat
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Welcome */}
        <p className="text-foreground text-sm font-medium">
          {getGreeting()}, {firstName}
        </p>

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Conversations</p>
            <p className="text-xl font-semibold">{totalConversations}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">With messages</p>
            <p className="text-xl font-semibold">{totalWithMessages}</p>
          </div>
        </div>

        {/* Recent conversations */}
        <div>
          <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
            Recent conversations
          </h2>
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border py-12">
              <MessageSquare className="text-muted-foreground/50 size-8" />
              <div className="text-center">
                <p className="text-foreground text-sm font-medium">No conversations yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Start your first chat to see it here.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/chat/overview">Start a conversation</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-border divide-y rounded-lg border">
              {conversations.map((conv) => (
                <Link
                  key={conv._id}
                  href={`/chat/${conv._id}` as "/"}
                  className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  {conv.channel === "whatsapp" ? (
                    <MessageCircle className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium">{conv.title || "Chat"}</p>
                      {conv.channel === "whatsapp" && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          WhatsApp
                        </span>
                      )}
                    </div>
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
