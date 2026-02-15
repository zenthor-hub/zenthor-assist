"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { MessageCircle, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";

import Loader from "@/components/loader";
import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";

interface ConversationListItem {
  _id: string;
  _creationTime: number;
  channel: "whatsapp" | "web" | "telegram";
  title?: string;
  lastMessage: {
    content: string;
    role: "user" | "assistant" | "system";
    createdAt: number;
  } | null;
}

function formatRelativeTime(t: (key: string) => string, timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return `${minutes}${t("m ago")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("h ago")}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${t("d ago")}`;
  return new Date(timestamp).toLocaleDateString();
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("Good morning");
  if (hour < 18) return t("Good afternoon");
  return t("Good evening");
}

export default function HomePage() {
  const t = useGT();
  const { user } = useUser();
  const rawConversations = useQuery(api.conversations.listRecentWithLastMessage, {});
  const conversations = (rawConversations ?? []) as ConversationListItem[];
  const onboarding = useQuery(api.onboarding.getMyState, {});
  const onboardingPending =
    onboarding !== undefined && onboarding !== null && onboarding.status !== "completed";

  if (rawConversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  const firstName = user?.firstName ?? t("there");
  const totalConversations = conversations.length;
  const totalWithMessages = conversations.filter((c) => c.lastMessage !== null).length;

  return (
    <PageWrapper
      title={<T>Home</T>}
      actions={
        <Button asChild size="sm" disabled={onboardingPending}>
          <Link href="/chat/overview" aria-disabled={onboardingPending}>
            <Plus className="size-4" />
            <T>New chat</T>
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Welcome */}
        <p className="text-foreground text-sm font-medium">
          {getGreeting(t)}, {firstName}
        </p>

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              <T>Conversations</T>
            </p>
            <p className="text-xl font-semibold">{totalConversations}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              <T>With messages</T>
            </p>
            <p className="text-xl font-semibold">{totalWithMessages}</p>
          </div>
        </div>

        {/* Recent conversations */}
        <div>
          <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
            <T>Recent conversations</T>
          </h2>
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border py-12">
              <MessageSquare className="text-muted-foreground/50 size-8" />
              <div className="text-center">
                <p className="text-foreground text-sm font-medium">
                  <T>No conversations yet</T>
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  <T>Start your first chat to see it here.</T>
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/chat/overview">
                  <T>Start a conversation</T>
                </Link>
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
                      <p className="truncate text-xs font-medium">{conv.title || <T>Chat</T>}</p>
                      {conv.channel === "whatsapp" && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          <T>WhatsApp</T>
                        </span>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-muted-foreground truncate text-xs">
                        {conv.lastMessage.role === "assistant" ? <T>Assistant:</T> : ("" as string)}
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatRelativeTime(t, conv.lastMessage.createdAt)}
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
