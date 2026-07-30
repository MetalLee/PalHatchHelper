import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import { isAppLocale, type AppLocale } from "@/i18n/routing";

import { publicPageProfiles, type PublicPageSlug } from "./page-config";

type PublicTranslator = (key: string) => string;

export function publicCanonicalUrl(
  locale: AppLocale,
  slug?: PublicPageSlug,
): string {
  return `${siteConfig.url}/${locale}${slug === undefined ? "" : `/${slug}`}`;
}

export function buildIndexablePageMetadata({
  locale,
  title,
  description,
  slug,
  keywords,
}: Readonly<{
  locale: AppLocale;
  title: string;
  description: string;
  slug?: PublicPageSlug;
  keywords?: readonly string[];
}>): Metadata {
  const canonicalUrl = publicCanonicalUrl(locale, slug);
  const chineseUrl = publicCanonicalUrl("zh", slug);
  const englishUrl = publicCanonicalUrl("en", slug);
  const imageUrl = `${siteConfig.url}/${locale}/opengraph-image`;
  const isChinese = locale === "zh";

  return {
    title: { absolute: title },
    description,
    ...(keywords === undefined ? {} : { keywords: [...keywords] }),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "zh-CN": chineseUrl,
        en: englishUrl,
        "x-default": chineseUrl,
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

export async function generatePublicPageMetadata({
  params,
  slug,
}: Readonly<{
  params: Promise<{ locale: string }>;
  slug: PublicPageSlug;
}>): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = (await getTranslations({
    locale,
    namespace: "PublicContent",
  })) as PublicTranslator;
  const key = publicPageProfiles[slug].messageKey;
  return buildIndexablePageMetadata({
    locale,
    slug,
    title: t(`${key}MetadataTitle`),
    description: t(`${key}MetadataDescription`),
  });
}
