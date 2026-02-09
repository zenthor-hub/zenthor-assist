import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden">
      {/* ── Background layers (matches landing page) ── */}
      <div className="landing-grid-pattern pointer-events-none absolute inset-0" />
      <div className="landing-crosshair-pattern pointer-events-none absolute inset-0 opacity-60" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, var(--background) 100%)",
        }}
      />

      {/* ── Logo + beta badge ── */}
      <div className="relative z-10 flex items-center gap-2.5">
        <Image
          src="/zenthor-logo-text.svg"
          alt="Zenthor"
          width={150}
          height={34}
          priority
          className="dark:hidden"
        />
        <Image
          src="/zenthor-logo-text-dark.svg"
          alt="Zenthor"
          width={150}
          height={34}
          priority
          className="hidden dark:block"
        />
        <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
          Beta
        </span>
      </div>

      {/* ── Clerk sign-in ── */}
      <SignIn
        forceRedirectUrl="/home"
        fallbackRedirectUrl="/home"
        signUpForceRedirectUrl="/chat"
        signUpFallbackRedirectUrl="/chat"
        appearance={{
          elements: {
            rootBox: "relative z-10 mx-auto",
            card: "shadow-xl",
          },
        }}
      />
    </div>
  );
}
