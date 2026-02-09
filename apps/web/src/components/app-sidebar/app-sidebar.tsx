"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Blocks,
  CheckSquare,
  House,
  LayoutGrid,
  MessageCircle,
  MessageSquare,
  Settings,
  Sparkles,
  SlidersHorizontal,
  UserCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { NavUser } from "./nav-user";
import { ThemeSwitcher } from "./theme-switcher";

type SidebarMode = "nav" | "chats" | "settings";

function getSidebarModeFromPath(pathname: string): SidebarMode {
  if (pathname.startsWith("/chat")) return "chats";
  if (pathname.startsWith("/settings")) return "settings";
  return "nav";
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<SidebarMode>(() => getSidebarModeFromPath(pathname));
  const transitionDir = useRef<"forward" | "back" | null>(null);

  function goToChats() {
    transitionDir.current = "forward";
    setMode("chats");
    router.push("/chat/overview");
  }

  function goToSettings() {
    transitionDir.current = "forward";
    setMode("settings");
    router.push("/settings/general");
  }

  function goToNav() {
    transitionDir.current = "back";
    setMode("nav");
  }

  const conversations = useQuery(api.conversations.listRecentWithLastMessage, {});
  const archiveConversation = useMutation(api.conversations.archive);

  useEffect(() => {
    setMode(getSidebarModeFromPath(pathname));
  }, [pathname]);

  async function handleArchive(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await archiveConversation({
        id: conversationId as Parameters<typeof archiveConversation>[0]["id"],
      });
      toast.success("Conversation archived");
      if (pathname.includes(conversationId)) {
        router.push("/chat/overview");
      }
    } catch {
      toast.error("Failed to archive conversation");
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* ── Header: logo text ── */}
      <SidebarHeader className="px-3 pt-4 pb-6">
        <Link
          href={"/chat/overview" as "/"}
          className="flex items-center group-data-[collapsible=icon]:justify-center"
        >
          <Image
            src="/zenthor-logo-text.svg"
            alt="Zenthor"
            width={110}
            height={24}
            className="group-data-[collapsible=icon]:hidden dark:hidden"
          />
          <Image
            src="/zenthor-logo-text-dark.svg"
            alt="Zenthor"
            width={110}
            height={24}
            className="hidden dark:block dark:group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/zenthor-logo.svg"
            alt="Zenthor"
            width={24}
            height={24}
            className="hidden group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>

      {/* ── Content ── */}
      <SidebarContent>
        {mode === "nav" ? (
          <SidebarGroup
            key="nav"
            className={transitionDir.current === "back" ? "animate-slide-in-left" : undefined}
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/home"} tooltip="Home">
                  <Link href={"/home" as "/"}>
                    <House className="size-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/chat")}
                  tooltip="Chats"
                  onClick={goToChats}
                >
                  <MessageSquare className="size-4" />
                  <span className="flex-1">Chats</span>
                  <ArrowRight className="text-muted-foreground size-3.5" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/tasks"} tooltip="Tasks">
                  <Link href={"/tasks" as "/"}>
                    <CheckSquare className="size-4" />
                    <span>Tasks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/skills"} tooltip="Skills">
                  <Link href={"/skills" as "/"}>
                    <Sparkles className="size-4" />
                    <span>Skills</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/settings")}
                  tooltip="Settings"
                  onClick={goToSettings}
                >
                  <Settings className="size-4" />
                  <span className="flex-1">Settings</span>
                  <ArrowRight className="text-muted-foreground size-3.5" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : mode === "chats" ? (
          <SidebarGroup key="chats" className="animate-slide-in-right">
            <SidebarMenu>
              <SidebarMenuItem>
                <button
                  type="button"
                  onClick={goToNav}
                  className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="flex-1 text-center font-medium">Chats</span>
                  <span className="size-4 shrink-0" />
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/chat/overview"}
                    tooltip="Overview"
                  >
                    <Link href={"/chat/overview" as "/"}>
                      <LayoutGrid className="size-4" />
                      <span>Overview</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                {conversations?.map((conv) => {
                  const isActive = pathname === `/chat/${conv._id}`;
                  const isWhatsAppConversation = conv.channel === "whatsapp";
                  return (
                    <SidebarMenuItem key={conv._id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={
                          isWhatsAppConversation
                            ? `${conv.title || "Chat"} (WhatsApp)`
                            : conv.title || "Chat"
                        }
                      >
                        <Link href={`/chat/${conv._id}` as "/"}>
                          {isWhatsAppConversation && (
                            <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span className="truncate">{conv.title || "Chat"}</span>
                          {isWhatsAppConversation && (
                            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              WA
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                      {conv.channel === "web" && (
                        <SidebarMenuAction onClick={(e) => handleArchive(e, conv._id)} showOnHover>
                          <Archive className="size-4" />
                        </SidebarMenuAction>
                      )}
                    </SidebarMenuItem>
                  );
                })}
                {conversations?.length === 0 && (
                  <div className="text-muted-foreground px-3 py-8 text-center text-xs">
                    No conversations yet
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup key="settings" className="animate-slide-in-right">
            <SidebarMenu>
              <SidebarMenuItem>
                <button
                  type="button"
                  onClick={goToNav}
                  className="hover:bg-sidebar-accent text-sidebar-foreground flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span className="flex-1 text-center font-medium">Settings</span>
                  <span className="size-4 shrink-0" />
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroupContent className="mt-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/general"}
                    tooltip="General"
                  >
                    <Link href={"/settings/general" as "/"}>
                      <SlidersHorizontal className="size-4" />
                      <span>General</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/profile"}
                    tooltip="Profile"
                  >
                    <Link href={"/settings/profile" as "/"}>
                      <UserCircle className="size-4" />
                      <span>Profile</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings/integrations"}
                    tooltip="Integrations"
                  >
                    <Link href={"/settings/integrations" as "/"}>
                      <Blocks className="size-4" />
                      <span>Integrations</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="gap-1 px-3 pb-3">
        <ThemeSwitcher />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
