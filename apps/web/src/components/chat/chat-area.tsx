"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { T, useGT } from "gt-next";
import { AlertCircle, Check, MessageSquare, ShieldAlert, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { friendlyModelName } from "@/lib/model-names";
import { logWebClientEvent } from "@/lib/observability/client";
import { cn } from "@/lib/utils";

import { TypingIndicator } from "./typing-indicator";
import type { PendingApproval } from "./use-convex-messages";
import { useConvexMessages } from "./use-convex-messages";

interface ChatAreaProps {
  conversationId: Id<"conversations">;
}

function ApprovalCard({
  approval,
  conversationId,
}: {
  approval: PendingApproval;
  conversationId: Id<"conversations">;
}) {
  const [resolving, setResolving] = useState<"approved" | "rejected" | null>(null);
  const resolve = useMutation(api.toolApprovals.resolve);
  const t = useGT();

  const isPending = approval.status === "pending" && !resolving;

  async function handleResolve(decision: "approved" | "rejected") {
    setResolving(decision);
    try {
      await resolve({
        approvalId: approval._id as Id<"toolApprovals">,
        status: decision,
      });
    } catch (error) {
      toast.error(t("Failed to resolve tool approval"));
      logWebClientEvent({
        event: "web.chat.tool_approval.resolve_failed",
        level: "error",
        payload: {
          approvalId: approval._id,
          conversationId,
          decision,
          toolName: approval.toolName,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : String(error),
        },
      });
      setResolving(null);
    }
  }

  const displayStatus = resolving ?? (approval.status !== "pending" ? approval.status : null);

  return (
    <Alert
      className={cn(
        "flex flex-col gap-2",
        isPending ? "border-amber-500/30 bg-amber-500/5" : undefined,
      )}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert
          className={cn("size-4 shrink-0", isPending ? "text-amber-500" : "text-muted-foreground")}
        />
        <AlertDescription className="flex-1 truncate font-mono font-semibold">
          {approval.toolName}
        </AlertDescription>
        {displayStatus === "approved" && (
          <span className="flex items-center gap-1 text-base text-green-600 dark:text-green-400">
            <Check className="size-3" />
            <T>Approved</T>
          </span>
        )}
        {displayStatus === "rejected" && (
          <span className="flex items-center gap-1 text-base text-red-600 dark:text-red-400">
            <X className="size-3" />
            <T>Rejected</T>
          </span>
        )}
      </div>
      {isPending && (
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={!!resolving}
            className="text-green-700 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
            onClick={() => handleResolve("approved")}
          >
            <Check />
            <T>Approve</T>
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!!resolving}
            className="text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
            onClick={() => handleResolve("rejected")}
          >
            <X />
            <T>Reject</T>
          </Button>
        </div>
      )}
    </Alert>
  );
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const t = useGT();
  const {
    messages,
    isProcessing,
    hasStreamingMessage,
    pendingApprovals,
    preferences,
    sendMessage,
  } = useConvexMessages(conversationId);

  const handleSend = useCallback(
    async (message: { text: string }) => {
      const trimmed = message.text.trim();
      if (!trimmed) return;
      await sendMessage(trimmed);
    },
    [sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Conversation>
        <ConversationContent className="gap-0 p-4">
          {messages === null ? null : messages.length === 0 ? (
            <ConversationEmptyState
              title={<T>Start a conversation</T>}
              description={<T>Send a message to begin chatting</T>}
              icon={<MessageSquare className="size-8" />}
            />
          ) : (
            messages.map((msg) => {
              if (msg.role === "system") return null;

              return (
                <div
                  key={msg._id}
                  className={cn(
                    msg.position === "middle" || msg.position === "last"
                      ? "mt-1"
                      : "mt-4 first:mt-0",
                  )}
                >
                  <Message from={msg.role}>
                    <MessageContent>
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : msg.status === "failed" ? (
                        <div className="flex items-start gap-2 py-1">
                          <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                          <p className="text-muted-foreground text-sm">
                            <T>
                              Failed to generate a response. Please try sending your message again.
                            </T>
                          </p>
                        </div>
                      ) : (
                        <>
                          {msg.content ? (
                            <MessageResponse>{msg.content}</MessageResponse>
                          ) : msg.streaming ? (
                            <div className="flex items-center gap-1 py-1">
                              <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
                              <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
                              <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
                            </div>
                          ) : null}
                          {msg.toolCalls &&
                            msg.toolCalls.length > 0 &&
                            msg.toolCalls.map((tc, i) => (
                              <Tool key={`${tc.name}-${i}`}>
                                <ToolHeader
                                  title={tc.name}
                                  type="dynamic-tool"
                                  toolName={tc.name}
                                  state={
                                    tc.output !== undefined ? "output-available" : "input-available"
                                  }
                                />
                                <ToolContent>
                                  <ToolInput input={tc.input} />
                                  {tc.output !== undefined && (
                                    <ToolOutput output={tc.output} errorText={undefined} />
                                  )}
                                </ToolContent>
                              </Tool>
                            ))}
                        </>
                      )}
                    </MessageContent>
                    {preferences?.showModelInfo && msg.modelUsed && msg.role === "assistant" && (
                      <span className="text-muted-foreground mt-1 block text-[10px]">
                        {friendlyModelName(msg.modelUsed)}
                      </span>
                    )}
                  </Message>
                </div>
              );
            })
          )}
          {pendingApprovals.map((approval) => (
            <div key={approval._id} className="mt-4">
              <ApprovalCard approval={approval} conversationId={conversationId} />
            </div>
          ))}
          {isProcessing && !hasStreamingMessage && (
            <div className="mt-4">
              <TypingIndicator />
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        <PromptInput onSubmit={handleSend}>
          <PromptInputTextarea placeholder={t("Type a message...")} />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
