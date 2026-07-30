import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { generatePublicPageMetadata } from "@/features/public-content/metadata";
import { PublicContentPage } from "@/features/public-content/public-page";
import { isAppLocale } from "@/i18n/routing";

const slug = "save-breeding-planner" as const;

export function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  return generatePublicPageMetadata({ params, slug });
}

export default async function SaveBreedingPlannerPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <PublicContentPage locale={locale} slug={slug} />;
}
