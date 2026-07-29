import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import { LandingPage } from "@/features/landing/landing-page";
import { isAppLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "LandingMetadata" });
  const canonicalUrl = `${siteConfig.url}/${locale}`;
  const imageUrl = `${siteConfig.url}/${locale}/opengraph-image`;
  const title = t("title");
  const description = t("description");
  const isChinese = locale === "zh";

  return {
    title: { absolute: title },
    description,
    keywords: t("keywords")
      .split(",")
      .map((keyword) => keyword.trim()),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "zh-CN": `${siteConfig.url}/zh`,
        en: `${siteConfig.url}/en`,
        "x-default": `${siteConfig.url}/zh`,
      },
    },
    openGraph: {
      title,
      description,
      siteName: siteConfig.name,
      type: "website",
      url: canonicalUrl,
      locale: isChinese ? "zh_CN" : "en_US",
      alternateLocale: [isChinese ? "en_US" : "zh_CN"],
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
    robots: { index: true, follow: true },
  };
}

export default async function Home({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <LandingPage locale={locale} />;
}
