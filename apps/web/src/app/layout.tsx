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
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/images/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/images/favicon-128x128.png", sizes: "128x128", type: "image/png" },
      { url: "/images/favicon-196x196.png", sizes: "196x196", type: "image/png" },
    ],
    apple: [
      { url: "/images/apple-touch-icon-57x57.png", sizes: "57x57" },
      { url: "/images/apple-touch-icon-60x60.png", sizes: "60x60" },
      { url: "/images/apple-touch-icon-72x72.png", sizes: "72x72" },
      { url: "/images/apple-touch-icon-76x76.png", sizes: "76x76" },
      { url: "/images/apple-touch-icon-114x114.png", sizes: "114x114" },
      { url: "/images/apple-touch-icon-120x120.png", sizes: "120x120" },
      { url: "/images/apple-touch-icon-144x144.png", sizes: "144x144" },
      { url: "/images/apple-touch-icon-152x152.png", sizes: "152x152" },
      { url: "/images/apple-touch-icon-167x167.png", sizes: "167x167" },
      { url: "/images/apple-touch-icon-180x180.png", sizes: "180x180" },
    ],
  },
  other: {
    "msapplication-TileColor": "#09090b",
    "msapplication-TileImage": "/images/mstile-144x144.png",
    "msapplication-config": "/browserconfig.xml",
  },
  openGraph: {
    title: "Zenthor Assist",
    description: "Zenthor Assist — your intelligent companion",
    siteName: "Zenthor Assist",
    type: "website",
    images: [
      {
        url: "/images/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Zenthor Assist",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Zenthor Assist",
    description: "Zenthor Assist — your intelligent companion",
    images: ["/images/android-chrome-512x512.png"],
  },
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
