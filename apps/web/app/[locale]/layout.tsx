import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";

import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { siteVerificationMetadata } from "@/config/seo";
import { siteConfig } from "@/config/site";
import { AppLocaleProvider } from "@/i18n/client";
import { catalogLocaleFor, routing } from "@/i18n/routing";

import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = t("title");
  const description = t("description");
  const verification = siteVerificationMetadata();
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: title, template: `%s | ${brand.name}` },
    description,
    keywords: [brand.name, "Palworld", ...t("keywords").split(",")],
    applicationName: brand.name,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    },
    openGraph: { title, description, siteName: brand.name, type: "website" },
    twitter: { card: "summary", title, description },
    appleWebApp: { capable: true, title: brand.name },
    ...(verification ? { verification } : {}),
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={catalogLocaleFor(locale)}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AppLocaleProvider locale={locale}>
            <TooltipProvider>{children}</TooltipProvider>
          </AppLocaleProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
