"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeOption = {
  label: string;
  value: "light" | "dark" | "system";
  icon: ComponentType<{ className?: string }>;
};

const themeOptions: ThemeOption[] = [
  { label: "Light mode", value: "light", icon: Sun },
  { label: "Dark mode", value: "dark", icon: Moon },
  { label: "System theme", value: "system", icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme switcher"
      className="border-sidebar-border bg-sidebar-accent/30 flex items-center gap-1 border p-1 group-data-[collapsible=icon]:hidden"
    >
      {themeOptions.map(({ icon: Icon, label, value }) => {
        const isActive = (theme ?? "system") === value;

        return (
          <Button
            key={value}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "size-7",
              isActive &&
                "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
            )}
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}
