"use client";

import { ChevronDown, Wrench } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  name: string;
  input: unknown;
}

export function ToolCallCard({ name, input }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="bg-background/50 hover:bg-background flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors">
        <Wrench className="text-muted-foreground size-3 shrink-0" />
        <span className="text-muted-foreground flex-1 truncate text-left font-mono">{name}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="overflow-x-auto rounded bg-black/10 p-2 text-xs dark:bg-white/10">
          {JSON.stringify(input, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
