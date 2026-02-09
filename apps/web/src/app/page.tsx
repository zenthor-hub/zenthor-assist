"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { House, LogIn, MessageCircle, Sparkles, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden" data-testid="landing-page">
      {/* ── Background layers ── */}
      <div className="landing-grid-pattern pointer-events-none absolute inset-0" />
      <div className="landing-crosshair-pattern pointer-events-none absolute inset-0 opacity-60" />

      {/* Radial vignette — fades pattern edges to background color */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, var(--background) 100%)",
        }}
      />

      {/* ── Nav ── */}
      <nav
        className="animate-fade-up relative z-10 flex items-center justify-between px-6 py-5 md:px-10"
        data-testid="landing-nav"
      >
        <div className="flex items-center gap-2.5">
          <Image
            src="/zenthor-logo-text.svg"
            alt="Zenthor"
            width={130}
            height={30}
            priority
            className="dark:hidden"
          />
          <Image
            src="/zenthor-logo-text-dark.svg"
            alt="Zenthor"
            width={130}
            height={30}
            priority
            className="hidden dark:block"
          />
          <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
            Beta
          </span>
        </div>
        <ModeToggle />
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 md:px-10">
        <div className="flex w-full max-w-2xl flex-col items-center">
          {/* Headline */}
          <h1
            className="animate-fade-up text-foreground text-center text-4xl leading-[1.1] font-bold tracking-tight md:text-5xl"
            style={{ animationDelay: "0.15s" }}
          >
            Conversation, <span className="text-primary">elevated.</span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up text-muted-foreground mt-4 max-w-md text-center text-sm leading-relaxed md:text-base"
            style={{ animationDelay: "0.3s" }}
          >
            Your intelligent companion — always ready, always sharp, always learning from every
            exchange.
          </p>

          {/* CTA */}
          <div
            className="animate-fade-up mt-8 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.45s" }}
          >
            <SignedOut>
              <Button asChild size="lg" className="gap-2 px-6">
                <Link href={"/sign-in" as "/"}>
                  Sign in
                  <LogIn className="size-4" />
                </Link>
              </Button>
              <p className="text-muted-foreground text-xs">
                Invite only — not open for sign-up yet.
              </p>
            </SignedOut>
            <SignedIn>
              <Button asChild size="lg" className="gap-2 px-6">
                <Link href={"/home" as "/"}>
                  Go to home
                  <House className="size-4" />
                </Link>
              </Button>
            </SignedIn>
          </div>
        </div>
      </main>

      {/* ── Feature bar ── */}
      <footer
        className="animate-fade-up relative z-10 border-t px-6 py-6 md:px-10"
        style={{ animationDelay: "0.6s" }}
        data-testid="landing-features"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center">
              <MessageCircle className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">WhatsApp & Web</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your assistant meets you where you are — chat on WhatsApp or the web.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center">
              <Zap className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Powerful skills</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Web search, task scheduling, and a growing toolkit that gets things done.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Always learning</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Context-aware memory that sharpens with every conversation.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
