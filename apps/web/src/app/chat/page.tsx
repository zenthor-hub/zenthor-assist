"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import Link from "next/link";

import { ChatLayout } from "@/components/chat/chat-layout";
import Loader from "@/components/loader";

export default function ChatPage() {
  return (
    <>
      <AuthLoading>
        <div className="flex h-full items-center justify-center">
          <Loader />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Sign in to start chatting</p>
          <Link
            href={"/sign-in" as never}
            className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Sign In
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <ChatLayout />
      </Authenticated>
    </>
  );
}
