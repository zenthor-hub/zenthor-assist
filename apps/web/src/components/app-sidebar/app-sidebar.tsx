"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  House,
  MessageCircle,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { ZenthorMark } from "@/components/zenthor-logo";
import { useAppContext } from "@/hooks/use-app-context";

import { NavUser } from "./nav-user";
import { ThemeSwitcher } from "./theme-switcher";

type SidebarMode = "nav" | "chats";

function getSidebarModeFromPath(pathname: string): SidebarMode {
  return pathname.startsWith("/chat") ? "chats" : "nav";
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAppContext();
  const [mode, setMode] = useState<SidebarMode>(() => getSidebarModeFromPath(pathname));

  const conversations = useQuery(api.conversations.listRecentWithLastMessage, { userId });
  const createConversation = useMutation(api.conversations.create);
  const archiveConversation = useMutation(api.conversations.archive);

  useEffect(() => {
    setMode(getSidebarModeFromPath(pathname));
  }, [pathname]);

  async function handleNewChat() {
    try {
      const id = await createConversation({ userId });
      router.push(`/chat/${id}`);
    } catch {
      toast.error("Failed to create conversation");
    }
  }

  async function handleArchive(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await archiveConversation({
        id: conversationId as Parameters<typeof archiveConversation>[0]["id"],
      });
      toast.success("Conversation archived");
      if (pathname.includes(conversationId)) {
        router.push("/chat");
      }
    } catch {
      toast.error("Failed to archive conversation");
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Zenthor Assist">
              <Link href={"/chat" as "/"}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center">
                  <ZenthorMark className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-base leading-tight">
                  <span className="truncate font-semibold">Zenthor</span>
                  <span className="truncate text-base">Assist</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {mode === "nav" ? (
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/home"} tooltip="Home">
                  <Link href={"/home" as "/"}>
                    <House />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/chat")}
                  tooltip="Chats"
                  onClick={() => setMode("chats")}
                >
                  <MessageSquare />
                  <span>Chats</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/skills"} tooltip="Skills">
                  <Link href={"/skills" as "/"}>
                    <Sparkles />
                    <span>Skills</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
                  <Link href={"/settings" as "/"}>
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <div className="flex items-center gap-1 px-2 py-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setMode("nav")}>
                <ArrowLeft className="size-4" />
              </Button>
              <span className="flex-1 text-base font-semibold">Chats</span>
              <Button variant="ghost" size="icon-sm" onClick={handleNewChat}>
                <Plus className="size-4" />
              </Button>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
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
                  <div className="text-muted-foreground px-4 py-6 text-center text-base">
                    No conversations yet
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <ThemeSwitcher />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
