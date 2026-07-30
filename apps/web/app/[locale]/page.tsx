import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LandingPage } from "@/features/landing/landing-page";
import { buildIndexablePageMetadata } from "@/features/public-content/metadata";
import { isAppLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "LandingMetadata" });
  const title = t("title");
  const description = t("description");
  return buildIndexablePageMetadata({
    locale,
    title,
    description,
    keywords: t("keywords")
      .split(",")
      .map((keyword) => keyword.trim()),
  });
}

export default async function Home({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <LandingPage locale={locale} />;
}
