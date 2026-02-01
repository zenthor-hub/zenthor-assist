"use client";

import { Bot, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { MarkdownContent } from "./markdown-content";
import { ToolCallCard } from "./tool-call-card";

interface ToolCall {
  name: string;
  input: unknown;
}

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

export function MessageBubble({ role, content, toolCalls, streaming }: MessageBubbleProps) {
  const isUser = role === "user";

  if (role === "system") return null;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar className={cn("mt-0.5", isUser ? "bg-primary" : "bg-muted")}>
        <AvatarFallback>
          {isUser ? (
            <User className="text-primary-foreground size-4" />
          ) : (
            <Bot className="text-foreground size-4" />
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[75%] rounded-sm px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            {content ? (
              <div className="inline">
                <MarkdownContent content={content} />
                {streaming && (
                  <span className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse" />
                )}
              </div>
            ) : streaming ? (
              <div className="flex items-center gap-1 py-1">
                <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
                <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
                <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
              </div>
            ) : null}
            {toolCalls && toolCalls.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {toolCalls.map((tc, i) => (
                  <ToolCallCard key={`${tc.name}-${i}`} name={tc.name} input={tc.input} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
