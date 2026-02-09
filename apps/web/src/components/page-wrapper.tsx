"use client";

import type { ReactNode } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { SidebarTrigger } from "./ui/sidebar";

interface PageWrapperProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  className?: string;
}

export function PageWrapper({
  children,
  title,
  actions,
  maxWidth = "2xl",
  className,
}: PageWrapperProps) {
  const isMobile = useIsMobile();

  const getMaxWidthClass = () => {
    switch (maxWidth) {
      case "sm":
        return "max-w-3xl";
      case "md":
        return "max-w-5xl";
      case "lg":
        return "max-w-6xl";
      case "xl":
        return "max-w-7xl";
      case "2xl":
        return "max-w-[1360px]";
      case "full":
        return "max-w-none";
      default:
        return "max-w-7xl";
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-border shrink-0 border-b px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-2", isMobile ? "px-3" : "px-4")}>
            <SidebarTrigger />
            <h1 className="text-foreground truncate text-sm font-semibold tracking-tight">
              {title}
            </h1>
          </div>

          {actions && (
            <div className={cn("flex items-center gap-2", isMobile ? "px-3" : "px-4")}>
              {actions}
            </div>
          )}
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full">
          <div
            className={cn(
              "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
              getMaxWidthClass(),
              className,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
