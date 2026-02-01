"use client";

import { Bot } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="bg-muted mt-0.5">
        <AvatarFallback>
          <Bot className="text-foreground size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted flex items-center gap-1 rounded-sm px-4 py-3">
        <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
        <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
        <span className="bg-foreground/40 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
      </div>
    </div>
  );
}
