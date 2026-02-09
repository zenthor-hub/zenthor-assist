"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { MessageCircle, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

export default function ChatOverviewPage() {
  const conversations = useQuery(api.conversations.listRecentWithLastMessage, {});
  const createConversation = useMutation(api.conversations.create);
  const router = useRouter();

  if (conversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  async function handleNewChat() {
    try {
      const id = await createConversation({});
      router.push(`/chat/${id}`);
    } catch {
      toast.error("Failed to create conversation");
    }
  }

  const webCount = conversations.filter((c) => c.channel === "web").length;
  const whatsappCount = conversations.filter((c) => c.channel === "whatsapp").length;
  const activeToday = conversations.filter((c) => {
    const ts = c.lastMessage?.createdAt ?? c._creationTime;
    return Date.now() - ts < 86_400_000;
  }).length;

  return (
    <PageWrapper
      title="Overview"
      actions={
        <Button onClick={handleNewChat} size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          New chat
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="text-xl font-semibold">{conversations.length}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="text-muted-foreground size-3" />
              <p className="text-muted-foreground text-xs">Web</p>
            </div>
            <p className="text-xl font-semibold">{webCount}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="size-3 text-emerald-600 dark:text-emerald-400" />
              <p className="text-muted-foreground text-xs">WhatsApp</p>
            </div>
            <p className="text-xl font-semibold">{whatsappCount}</p>
          </div>
        </div>

        {/* Active today */}
        <p className="text-muted-foreground text-xs">
          {activeToday} conversation{activeToday !== 1 ? "s" : ""} active today
        </p>

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
              <Button onClick={handleNewChat} variant="outline" size="sm" className="mt-1">
                Start a conversation
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
