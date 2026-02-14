"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { env } from "@zenthor-assist/env/web";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useTheme } from "next-themes";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { TooltipProvider } from "./ui/tooltip";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

function ThemedClerkProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signInForceRedirectUrl="/home"
      signInFallbackRedirectUrl="/home"
      signUpForceRedirectUrl="/chat"
      signUpFallbackRedirectUrl="/chat"
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        variables: {
          fontFamily: "var(--font-sans)",
          borderRadius: "0.375rem",
          colorPrimary: "var(--primary)",
          colorBackground: "var(--card)",
          colorInputBackground: "var(--input)",
          colorInputText: "var(--foreground)",
          colorText: "var(--foreground)",
          colorTextSecondary: "var(--muted-foreground)",
          colorDanger: "var(--destructive)",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemedClerkProvider>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexProviderWithClerk>
        <Toaster richColors />
      </ThemedClerkProvider>
    </ThemeProvider>
  );
}
