"use client";

import { ArrowLeft, Compass, Satellite } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ZenthorHeroMark, ZenthorMark } from "@/components/zenthor-logo";

export default function NotFound() {
  return (
    <div className="noise-texture relative flex min-h-full flex-col overflow-hidden">
      <div
        className="animate-subtle-drift pointer-events-none absolute -top-[18%] -left-[12%] h-[520px] w-[520px] rounded-full opacity-[0.12] blur-[110px]"
        style={{
          background: "radial-gradient(circle, oklch(0.55 0.14 250) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-subtle-drift pointer-events-none absolute -right-[10%] -bottom-[18%] h-[520px] w-[520px] rounded-full opacity-[0.1] blur-[110px]"
        style={{
          background: "radial-gradient(circle, oklch(0.78 0.11 35) 0%, transparent 70%)",
          animationDelay: "-9s",
        }}
      />
      <div
        className="animate-subtle-drift pointer-events-none absolute top-[35%] right-[25%] h-[280px] w-[280px] rounded-full opacity-[0.06] blur-[90px]"
        style={{
          background: "radial-gradient(circle, oklch(0.6 0.12 250) 0%, transparent 70%)",
          animationDelay: "-14s",
        }}
      />

      <nav className="animate-fade-up relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <ZenthorMark className="text-primary size-7" />
          <span className="text-foreground font-sans text-[15px] font-semibold tracking-tight">
            zenthor
          </span>
        </div>
      </nav>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center md:px-10">
        <div className="flex w-full max-w-2xl flex-col items-center">
          <div className="animate-fade-up mb-8" style={{ animationDelay: "0.1s" }}>
            <ZenthorHeroMark className="text-primary size-20 md:size-28" aria-hidden="true" />
          </div>

          <p
            className="animate-fade-up text-primary/80 text-xs font-semibold tracking-[0.35em] uppercase"
            style={{ animationDelay: "0.2s" }}
          >
            404
          </p>
          <h1
            className="animate-fade-up text-foreground mt-4 font-sans text-3xl leading-tight font-semibold tracking-tight md:text-5xl"
            style={{ animationDelay: "0.3s" }}
          >
            Signal lost.
          </h1>
          <p
            className="animate-fade-up text-muted-foreground mt-4 max-w-md text-sm leading-relaxed md:text-base"
            style={{ animationDelay: "0.4s" }}
          >
            That page isn&apos;t in the Zenthor network. Choose a waypoint below to get back on
            track.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.55s" }}
          >
            <Button asChild size="lg" className="gap-2 px-5">
              <Link href="/">
                Back home
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 px-5">
              <Link href={"/chat" as "/"}>
                Open chat
                <Compass className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="animate-fade-up relative z-10 border-t px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Satellite className="text-primary size-4" />
            <span>Routing back to safe navigation.</span>
          </div>
          <span className="text-muted-foreground text-xs">
            Lost? Try the dashboard or start a new session.
          </span>
        </div>
      </footer>
    </div>
  );
}
