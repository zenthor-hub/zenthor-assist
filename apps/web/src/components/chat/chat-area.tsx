"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { T, useGT } from "gt-next";
import {
  AlertCircle,
  Check,
  ListChecks,
  MessageSquare,
  PenSquare,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CodeBlock } from "@/components/ai-elements/code-block";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { friendlyModelName } from "@/lib/model-names";
import { logWebClientEvent } from "@/lib/observability/client";
import { cn } from "@/lib/utils";

import { TypingIndicator } from "./typing-indicator";
import type { PendingApproval } from "./use-convex-messages";
import { useConvexMessages } from "./use-convex-messages";

interface ChatAreaProps {
  conversationId: Id<"conversations">;
  noteContext?: {
    noteId: Id<"notes">;
    title: string;
  };
}

const TOOL_SUMMARY_MAX_LENGTH = 96;
const TRANSFORM_MODEL = "agent-notes-tools";

type ToolCallSummary = {
  name: string;
  input: unknown;
  output?: unknown;
};

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;

const summarizeToolValue = (value: unknown): string => {
  if (value === undefined) return "No details";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value || "(empty string)", 54);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "Empty object";
    }

    const compactEntries = entries.slice(0, 2).map(([key, nestedValue]) => {
      if (Array.isArray(nestedValue)) {
        return `${key}: ${nestedValue.length} item${nestedValue.length === 1 ? "" : "s"}`;
      }
      if (nestedValue === undefined || nestedValue === null) {
        return `${key}: ${String(nestedValue)}`;
      }
      if (typeof nestedValue === "object") {
        return `${key}: object`;
      }
      return `${key}: ${String(nestedValue)}`;
    });

    const suffix = entries.length > 2 ? ", ..." : "";
    return truncate(`${compactEntries.join(", ")}${suffix}`, 54);
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? "Complex value"
      : truncate(serialized, TOOL_SUMMARY_MAX_LENGTH);
  } catch {
    return "Complex value";
  }
};

const toolCallSummary = ({ output, input }: ToolCallSummary): string =>
  output === undefined
    ? `Input: ${summarizeToolValue(input)}`
    : `Result: ${summarizeToolValue(output)}`;

type NoteTransformResult = {
  noteId: string;
  intent: string;
  resultText: string;
  operations?: string;
};

const parseNoteTransformOutput = (value: unknown): NoteTransformResult | null => {
  if (value === undefined || value === null) return null;

  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const parseCandidate = (candidate: string) => {
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        return null;
      }
    };

    const fencedCandidate = fenced && fenced[1] ? parseCandidate(fenced[1]!.trim()) : null;
    if (fencedCandidate !== null) {
      parsed = fencedCandidate;
    } else {
      parsed = parseCandidate(trimmed);
      if (parsed === null) {
        const firstBrace = trimmed.indexOf("{");
        const lastBrace = trimmed.lastIndexOf("}");
        const fallback =
          firstBrace >= 0 && lastBrace > firstBrace
            ? parseCandidate(trimmed.slice(firstBrace, lastBrace + 1))
            : null;
        if (fallback === null) return null;
        parsed = fallback;
      }
    }
  }

  if (typeof parsed !== "object") return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.name !== "note_transform") {
    // output payloads for tool calls are passed as `output`, not a top-level object with `name`.
    if (candidate.noteId === undefined || candidate.resultText === undefined) return null;
  }

  const noteId = typeof candidate.noteId === "string" ? candidate.noteId : null;
  const resultText = typeof candidate.resultText === "string" ? candidate.resultText : null;
  if (!noteId || !resultText) return null;

  const intent = typeof candidate.intent === "string" ? candidate.intent : "";
  const operations = typeof candidate.operations === "string" ? candidate.operations : undefined;

  return { noteId, intent, resultText, operations };
};

const formatToolJson = (value: unknown): string => {
  if (value === undefined) return "No details";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

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

export function ChatArea({ conversationId, noteContext }: ChatAreaProps) {
  const t = useGT();
  const [applyingTransforms, setApplyingTransforms] = useState<Set<string>>(new Set());
  const {
    messages,
    isProcessing,
    hasStreamingMessage,
    pendingApprovals,
    preferences,
    hasMoreMessages,
    isLoadingHistory,
    loadOlderMessages,
    sendMessage,
    noteContext: resolvedNoteContext,
  } = useConvexMessages(
    conversationId,
    noteContext
      ? {
          noteId: noteContext.noteId,
          noteTitle: noteContext.title,
        }
      : undefined,
  );

  const applyNoteTransform = useMutation(api.notes.applyAiPatch);
  const hasActiveNoteContext = !!resolvedNoteContext;

  const noteActions = hasActiveNoteContext
    ? [
        {
          icon: Sparkles,
          id: "summarize",
          label: <T>Generate summary</T>,
          command: "/summarize this note",
        },
        {
          icon: ListChecks,
          id: "task-list",
          label: <T>Turn into task list</T>,
          command: "/extract actions",
        },
        {
          icon: PenSquare,
          id: "rewrite",
          label: <T>Rewrite in tone…</T>,
          command: "/rewrite in a clear, concise tone",
        },
        {
          icon: PenSquare,
          id: "rewrite-whole",
          label: <T>Rewrite whole note</T>,
          command: "/rewrite this whole note",
        },
      ]
    : null;

  const handleQuickAction = useCallback(
    async (command: string) => {
      await sendMessage(command);
    },
    [sendMessage],
  );

  const handleApplyTransform = useCallback(
    async (toolKey: string, payload: NoteTransformResult) => {
      if (applyingTransforms.has(toolKey)) return;
      setApplyingTransforms((current) => new Set(current).add(toolKey));
      try {
        await applyNoteTransform({
          id: payload.noteId as Id<"notes">,
          content: payload.resultText,
          operations: payload.operations,
          model: TRANSFORM_MODEL,
        });
        toast.success(t("Applied transform to note"));
      } catch {
        toast.error(t("Failed to apply note transform"));
      } finally {
        setApplyingTransforms((current) => {
          const next = new Set(current);
          next.delete(toolKey);
          return next;
        });
      }
    },
    [applyingTransforms, applyNoteTransform, t],
  );

  const renderNoteReference = useCallback(
    (noteId: string) => {
      const label = noteId.length > 18 ? `${noteId.slice(0, 8)}…${noteId.slice(-6)}` : noteId;
      const isCurrentNote = noteId === resolvedNoteContext?.noteId;

      return (
        <div className="mt-1">
          <Badge variant="outline" className="bg-muted/40">
            {isCurrentNote ? (
              <span className="text-muted-foreground text-[11px]">
                <T>Current note:</T> {resolvedNoteContext?.title}
              </span>
            ) : (
              <Link className="hover:underline" href={`/notes/${noteId}`}>
                <T>Note:</T> {label}
              </Link>
            )}
          </Badge>
        </div>
      );
    },
    [resolvedNoteContext?.noteId, resolvedNoteContext?.title],
  );

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
      {hasActiveNoteContext && (
        <div className="border-border border-b p-3">
          <p className="text-sm font-medium">
            <T>Editing note:</T> {resolvedNoteContext?.title}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            <T>Use quick actions or ask the assistant for a specific edit.</T>
          </p>
        </div>
      )}
      <Conversation>
        <ConversationContent className="gap-0 p-4">
          {messages !== null && hasMoreMessages ? (
            <div className="mb-3">
              <Button
                size="xs"
                type="button"
                variant="outline"
                onClick={() => {
                  void loadOlderMessages();
                }}
                disabled={isLoadingHistory}
              >
                <Sparkles className="size-3" />
                {isLoadingHistory ? (
                  <T>Loading earlier messages...</T>
                ) : (
                  <T>Load earlier messages</T>
                )}
              </Button>
            </div>
          ) : null}
          {messages === null ? null : messages.length === 0 ? (
            <ConversationEmptyState
              title={<T>Start a conversation</T>}
              description={<T>Send a message to begin chatting</T>}
              icon={<MessageSquare className="size-8" />}
            />
          ) : (
            messages.map((msg) => {
              if (msg.role === "system") return null;
              const shouldShowToolSummary = preferences?.showToolDetails ?? false;

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
                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div className="mt-2 space-y-2">
                              <p className="text-muted-foreground text-xs">
                                <T>Tool calls</T>:
                              </p>
                              <div className="border-border rounded-lg border">
                                {shouldShowToolSummary && (
                                  <div className="space-y-1 p-2 text-xs">
                                    {msg.toolCalls.map((tc, i) => {
                                      const transformResult =
                                        tc.name === "note_transform"
                                          ? parseNoteTransformOutput(tc.output)
                                          : null;
                                      const summary = toolCallSummary(tc);
                                      return (
                                        <div key={`${tc.name}-${i}`} className="space-y-1">
                                          <p className="truncate text-[11px]">
                                            <span className="text-muted-foreground mr-2">
                                              #{i + 1}
                                            </span>
                                            <span className="font-medium">{tc.name}</span>
                                            <span className="text-muted-foreground ml-1">
                                              — {summary}
                                            </span>
                                          </p>
                                          {transformResult ? (
                                            <p className="text-muted-foreground truncate text-[10px]">
                                              <T>Preview:</T>{" "}
                                              {truncate(transformResult.resultText, 120)}
                                            </p>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button className="mt-1 w-full" size="xs" variant="outline">
                                      <T>View tool details</T>
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-[min(1100px,95vw)] min-w-[min(820px,95vw)]">
                                    <DialogHeader>
                                      <DialogTitle>
                                        <T>Tool call details</T>
                                      </DialogTitle>
                                      <DialogDescription>
                                        <T>
                                          Expand tool inputs and outputs from this assistant
                                          response.
                                        </T>
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-2">
                                      {msg.toolCalls.map((tc, i) => {
                                        const transformResult =
                                          tc.name === "note_transform"
                                            ? parseNoteTransformOutput(tc.output)
                                            : null;
                                        const applyKey = `${msg._id}-${tc.name}-${i}`;
                                        const isApplying = applyingTransforms.has(applyKey);

                                        return (
                                          <div
                                            key={`${tc.name}-dialog-${i}`}
                                            className="border-border rounded-lg border"
                                          >
                                            <div className="border-b px-3 py-2 text-sm">
                                              <p className="font-medium">
                                                #{i + 1} {tc.name}
                                              </p>
                                              {transformResult?.intent ? (
                                                <p className="text-muted-foreground mt-1 text-xs">
                                                  <T>Intent:</T> {transformResult.intent}
                                                </p>
                                              ) : null}
                                            </div>
                                            <div className="space-y-3 p-3">
                                              <div>
                                                <p className="text-muted-foreground mb-1 text-xs uppercase">
                                                  <T>Input</T>
                                                </p>
                                                <CodeBlock
                                                  code={formatToolJson(tc.input)}
                                                  language="json"
                                                />
                                              </div>
                                              {tc.output !== undefined && (
                                                <div>
                                                  <p className="text-muted-foreground mb-1 text-xs uppercase">
                                                    <T>Output</T>
                                                  </p>
                                                  <CodeBlock
                                                    code={formatToolJson(tc.output)}
                                                    language="json"
                                                  />
                                                  {transformResult ? (
                                                    <Button
                                                      size="xs"
                                                      variant="outline"
                                                      className="mt-2"
                                                      disabled={isApplying}
                                                      onClick={() =>
                                                        void handleApplyTransform(
                                                          applyKey,
                                                          transformResult,
                                                        )
                                                      }
                                                    >
                                                      <Sparkles className="size-3" />
                                                      {isApplying ? (
                                                        <T>Applying...</T>
                                                      ) : (
                                                        <T>Apply to note</T>
                                                      )}
                                                    </Button>
                                                  ) : null}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          )}
                          {msg.noteId ? renderNoteReference(msg.noteId) : null}
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
        {noteActions ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {noteActions.map((action) => (
              <Button
                key={action.id}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleQuickAction(action.command)}
              >
                <action.icon className="size-3" />
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
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
