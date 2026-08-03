import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/layout/page-hero";
import { privatePageMetadata } from "@/config/seo";
import { BindingInvitationConfirmation } from "@/features/sync/binding-invitation-confirmation";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string; token: string }>;
}>): Promise<Metadata> {
  const { locale } = await params;
  const appLocale = requireAppLocale(locale);
  const t = await getTranslations({
    locale: appLocale,
    namespace: "BindingInvitation",
  });
  return { ...privatePageMetadata, title: t("title") };
}

export default async function BindingInvitationPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; token: string }>;
}>) {
  const { locale, token } = await params;
  const appLocale = requireAppLocale(locale);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const t = await getTranslations({
    locale: appLocale,
    namespace: "BindingInvitation",
  });
  return (
    <div className="grid min-w-0 gap-6 pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <BindingInvitationConfirmation token={token} />
    </div>
  );
}
