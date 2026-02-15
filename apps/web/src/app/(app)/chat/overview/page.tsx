"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { T, useGT } from "gt-next";
import { MessageCircle, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

export default function ChatOverviewPage() {
  const t = useGT();
  const rawConversations = useQuery(api.conversations.listRecentWithLastMessage, {});
  const conversations = (rawConversations ?? []) as ConversationListItem[];
  const onboarding = useQuery(api.onboarding.getMyState, {});
  const createConversation = useMutation(api.conversations.create);
  const router = useRouter();
  const onboardingPending =
    onboarding !== undefined && onboarding !== null && onboarding.status !== "completed";

  if (rawConversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader />
      </div>
    );
  }

  async function handleNewChat() {
    if (onboardingPending) {
      toast.error(t("Complete onboarding with Guilb before starting a new chat"));
      return;
    }
    try {
      const id = await createConversation({});
      router.push(`/chat/${id}`);
    } catch {
      toast.error(t("Failed to create conversation"));
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
      title={<T>Overview</T>}
      actions={
        <Button onClick={handleNewChat} size="sm" className="gap-1.5" disabled={onboardingPending}>
          <Plus className="size-3.5" />
          <T>New chat</T>
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              <T>Total</T>
            </p>
            <p className="text-xl font-semibold">{conversations.length}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="text-muted-foreground size-3" />
              <p className="text-muted-foreground text-xs">
                <T>Web</T>
              </p>
            </div>
            <p className="text-xl font-semibold">{webCount}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="size-3 text-emerald-600 dark:text-emerald-400" />
              <p className="text-muted-foreground text-xs">
                <T>WhatsApp</T>
              </p>
            </div>
            <p className="text-xl font-semibold">{whatsappCount}</p>
          </div>
        </div>

        {/* Active today */}
        <p className="text-muted-foreground text-xs">
          {activeToday === 1 ? (
            <T>1 conversation active today</T>
          ) : (
            <>
              {activeToday} <T>conversations active today</T>
            </>
          )}
        </p>

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
              <Button
                onClick={handleNewChat}
                variant="outline"
                size="sm"
                className="mt-1"
                disabled={onboardingPending}
              >
                <T>Start a conversation</T>
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
                        {conv.lastMessage.role === "assistant" ? <T>Assistant:</T> : ""}
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
