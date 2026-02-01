"use client";

import { Bot, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";

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
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
