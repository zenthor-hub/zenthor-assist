import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

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

export const metadata: Metadata = {
  title: "Zenthor Assist",
  description: "Zenthor Assist — your intelligent companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={notoSans.variable} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider signInUrl="/sign-in" afterSignInUrl="/" afterSignUpUrl="/">
          <Providers>
            <div className="flex h-svh flex-col overflow-hidden">{children}</div>
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
