import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { brand, brandTitle } from "@/config/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: brandTitle,
    template: `%s | ${brand.name}`,
  },
  description: brand.description,
  keywords: [
    brand.name,
    "幻兽帕鲁",
    "Palworld",
    "帕鲁服务器",
    "服务器控制台",
    "帕鲁库存",
    "帕鲁配种",
    "配种规划",
    "Palworld server dashboard",
  ],
  applicationName: brand.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: brandTitle,
    description: brand.description,
    siteName: brand.name,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: brandTitle,
    description: brand.description,
  },
  appleWebApp: {
    capable: true,
    title: brand.name,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
