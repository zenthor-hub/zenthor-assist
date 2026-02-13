"use client";

import { useGT } from "gt-next";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ThemeOption = {
  value: "light" | "dark" | "system";
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const themeOptions: ThemeOption[] = [
  { label: "Light mode", value: "light", icon: Sun },
  { label: "Dark mode", value: "dark", icon: Moon },
  { label: "System theme", value: "system", icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useGT();

  return (
    <div
      role="group"
      aria-label={t("Theme switcher")}
      className="border-sidebar-border bg-sidebar-accent/30 flex items-center justify-between rounded-md border p-0.5 group-data-[collapsible=icon]:hidden"
    >
      {themeOptions.map(({ icon: Icon, value, label: labelKey }) => {
        const isActive = (theme ?? "system") === value;
        const label = t(labelKey);

        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={label}
                onClick={() => setTheme(value)}
                className={cn(
                  "h-6 flex-1 rounded-sm",
                  isActive &&
                    "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
