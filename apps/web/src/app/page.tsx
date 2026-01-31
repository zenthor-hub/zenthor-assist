"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight01Icon,
  DashboardSquare01Icon,
  Message01Icon,
  SparklesIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { ZenthorHeroMark, ZenthorMark } from "@/components/zenthor-logo";

export default function Home() {
  return (
    <div className="noise-texture relative flex min-h-full flex-col overflow-hidden">
      {/* Atmospheric background layers */}
      <div
        className="animate-subtle-drift pointer-events-none absolute -top-[20%] -left-[10%] h-[700px] w-[700px] rounded-full opacity-[0.12] blur-[120px]"
        style={{
          background: "radial-gradient(circle, oklch(0.55 0.14 250) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-subtle-drift pointer-events-none absolute -right-[5%] -bottom-[15%] h-[600px] w-[600px] rounded-full opacity-[0.08] blur-[100px]"
        style={{
          background: "radial-gradient(circle, oklch(0.78 0.11 35) 0%, transparent 70%)",
          animationDelay: "-7s",
        }}
      />
      <div
        className="animate-subtle-drift pointer-events-none absolute top-[40%] right-[20%] h-[300px] w-[300px] rounded-full opacity-[0.06] blur-[80px]"
        style={{
          background: "radial-gradient(circle, oklch(0.6 0.12 250) 0%, transparent 70%)",
          animationDelay: "-13s",
        }}
      />

      {/* Top bar */}
      <nav
        className="animate-fade-up relative z-10 flex items-center justify-between px-6 py-5 md:px-10"
        data-testid="landing-nav"
      >
        <div className="flex items-center gap-2.5">
          <ZenthorMark className="text-primary size-7" />
          <span className="font-display text-foreground text-[15px] font-semibold tracking-tight">
            zenthor
          </span>
        </div>
        <ModeToggle />
      </nav>

      {/* Hero section */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 md:px-10">
        <div className="flex w-full max-w-3xl flex-col items-center">
          {/* Large geometric mark */}
          <div className="animate-fade-up mb-10" style={{ animationDelay: "0.15s" }}>
            <ZenthorHeroMark className="text-primary size-24 md:size-32" aria-hidden="true" />
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up font-display text-foreground text-center text-4xl leading-[1.1] font-bold tracking-tight md:text-6xl"
            style={{ animationDelay: "0.3s" }}
          >
            Conversation,
            <br />
            <span className="text-primary">elevated.</span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up text-muted-foreground mt-5 max-w-md text-center text-base leading-relaxed md:text-lg"
            style={{ animationDelay: "0.45s" }}
          >
            Zenthor Assist is your intelligent companion — always ready, always sharp, always
            learning from every exchange.
          </p>

          {/* CTA */}
          <div
            className="animate-fade-up mt-10 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.6s" }}
          >
            <SignedOut>
              <Button asChild size="lg" className="gap-2 px-5">
                <Link href={"/sign-in" as "/"}>
                  Sign in
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                </Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild size="lg" className="gap-2 px-5">
                <Link href={"/dashboard" as "/"}>
                  Go to dashboard
                  <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4" />
                </Link>
              </Button>
            </SignedIn>
          </div>
        </div>
      </main>

      {/* Feature hints */}
      <footer
        className="animate-fade-up relative z-10 border-t px-6 py-8 md:px-10"
        style={{ animationDelay: "0.75s" }}
        data-testid="landing-features"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              <HugeiconsIcon icon={Message01Icon} className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Natural dialogue</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Fluid conversations that feel genuinely helpful, not scripted.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              <HugeiconsIcon icon={ZapIcon} className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Instant answers</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Powered by Claude with real-time web search and tools.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              <HugeiconsIcon icon={SparklesIcon} className="size-4" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Always improving</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Context-aware memory that gets sharper with every session.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
