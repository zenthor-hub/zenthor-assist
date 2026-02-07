import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
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
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <body className={`${geistMono.variable} antialiased`}>
        <Providers>
          <div className="flex h-svh flex-col overflow-hidden">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
