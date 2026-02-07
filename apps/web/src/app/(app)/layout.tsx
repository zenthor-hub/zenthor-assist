"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar/app-sidebar";
import Loader from "@/components/loader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const getOrCreateUser = useMutation(api.users.getOrCreateFromClerk);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function init() {
      await getOrCreateUser({
        name: user!.fullName || user!.firstName || "User",
        email: user!.primaryEmailAddress?.emailAddress,
        image: user!.imageUrl,
      });
      setReady(true);
    }

    init();
  }, [user, getOrCreateUser]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
