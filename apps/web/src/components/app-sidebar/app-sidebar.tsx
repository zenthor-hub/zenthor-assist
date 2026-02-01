"use client";

import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArrowLeft, LayoutDashboard, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type * as React from "react";

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

type SidebarMode = "nav" | "chats";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAppContext();
  const [mode, setMode] = useState<SidebarMode>("nav");

  const conversations = useQuery(api.conversations.listRecentWithLastMessage, { userId });
  const createConversation = useMutation(api.conversations.create);
  const archiveConversation = useMutation(api.conversations.archive);

  useEffect(() => {
    if (pathname === "/dashboard") {
      setMode("nav");
    }
  }, [pathname]);

  async function handleNewChat() {
    const id = await createConversation({ userId });
    router.push(`/chat/${id}`);
  }

  async function handleArchive(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    await archiveConversation({
      id: conversationId as Parameters<typeof archiveConversation>[0]["id"],
    });
    if (pathname.includes(conversationId)) {
      router.push("/chat");
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Zenthor Assist">
              <Link href={"/chat" as "/"}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <ZenthorMark className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-sans font-semibold">Zenthor</span>
                  <span className="truncate text-xs">Assist</span>
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
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Dashboard">
                  <Link href={"/dashboard" as "/"}>
                    <LayoutDashboard />
                    <span>Dashboard</span>
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
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <div className="flex items-center gap-1 px-2 py-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setMode("nav")}>
                <ArrowLeft className="size-4" />
              </Button>
              <span className="flex-1 text-sm font-semibold">Chats</span>
              <Button variant="ghost" size="icon-sm" onClick={handleNewChat}>
                <Plus className="size-4" />
              </Button>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {conversations?.map((conv) => {
                  const isActive = pathname === `/chat/${conv._id}`;
                  return (
                    <SidebarMenuItem key={conv._id}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={conv.title || "Chat"}>
                        <Link href={`/chat/${conv._id}` as "/"}>
                          <span className="truncate">{conv.title || "Chat"}</span>
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
                  <div className="text-muted-foreground px-4 py-6 text-center text-xs">
                    No conversations yet
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
