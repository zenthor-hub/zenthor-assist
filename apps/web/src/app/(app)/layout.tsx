"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@zenthor-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-assist/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar/app-sidebar";
import Loader from "@/components/loader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppContext } from "@/hooks/use-app-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const getOrCreateUser = useMutation(api.users.getOrCreateFromClerk);

  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function init() {
      const uId = await getOrCreateUser({
        externalId: user!.id,
        name: user!.fullName || user!.firstName || "User",
        email: user!.primaryEmailAddress?.emailAddress,
        image: user!.imageUrl,
      });
      setUserId(uId);
      setLoading(false);
    }

    init();
  }, [user, getOrCreateUser]);

  if (loading || !userId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ userId }}>
      <SidebarProvider className="h-screen overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-hidden">{children}</SidebarInset>
      </SidebarProvider>
    </AppContext.Provider>
  );
}
