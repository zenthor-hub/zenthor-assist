"use client";

import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import Link from "next/link";

import "../index.css";
import { Button } from "@/components/ui/button";
import { ZenthorHeroMark, ZenthorMark } from "@/components/zenthor-logo";

const notoSans = Noto_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en" className={notoSans.variable} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="noise-texture bg-background text-foreground relative flex min-h-svh flex-col overflow-hidden">
          <div
            className="animate-subtle-drift pointer-events-none absolute -top-[20%] -left-[10%] h-[640px] w-[640px] rounded-full opacity-[0.12] blur-[120px]"
            style={{
              background: "radial-gradient(circle, oklch(0.55 0.14 250) 0%, transparent 70%)",
            }}
          />
          <div
            className="animate-subtle-drift pointer-events-none absolute -right-[8%] -bottom-[18%] h-[560px] w-[560px] rounded-full opacity-[0.1] blur-[110px]"
            style={{
              background: "radial-gradient(circle, oklch(0.58 0.22 27) 0%, transparent 70%)",
              animationDelay: "-8s",
            }}
          />
          <div
            className="animate-subtle-drift pointer-events-none absolute top-[40%] right-[20%] h-[300px] w-[300px] rounded-full opacity-[0.08] blur-[90px]"
            style={{
              background: "radial-gradient(circle, oklch(0.78 0.11 35) 0%, transparent 70%)",
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
                system error
              </p>
              <h1
                className="animate-fade-up text-foreground mt-4 font-sans text-3xl leading-tight font-semibold tracking-tight md:text-5xl"
                style={{ animationDelay: "0.3s" }}
              >
                Something slipped out of sync.
              </h1>
              <p
                className="animate-fade-up text-muted-foreground mt-4 max-w-md text-sm leading-relaxed md:text-base"
                style={{ animationDelay: "0.4s" }}
              >
                Zenthor hit an unexpected snag while loading this view. Reset the connection or head
                back home.
              </p>

              <div
                className="animate-fade-up bg-card/70 mt-6 w-full max-w-md rounded-2xl border p-4 text-left shadow-sm backdrop-blur"
                style={{ animationDelay: "0.5s" }}
              >
                <div className="flex items-start gap-3">
                  <div className="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-md">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Unexpected error</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      We couldn&apos;t complete that request.
                    </p>
                  </div>
                </div>
                {isDev ? (
                  <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                    {error.message || "No error message available."}
                  </p>
                ) : null}
                {error.digest ? (
                  <p className="text-muted-foreground mt-2 text-xs">Reference: {error.digest}</p>
                ) : null}
              </div>

              <div
                className="animate-fade-up mt-8 flex flex-col items-center gap-3 sm:flex-row"
                style={{ animationDelay: "0.6s" }}
              >
                <Button size="lg" className="gap-2 px-5" onClick={() => reset()}>
                  Try again
                  <RotateCw className="size-4" />
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2 px-5">
                  <Link href="/">
                    Back home
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
