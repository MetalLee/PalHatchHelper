import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/features/auth/server";
import { SyncDeviceCard } from "@/features/sync/sync-device-card";
import { requireAppLocale } from "@/i18n/server-locale";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });
  const context = await requireUserContext();
  const supabase = await createServerSupabaseClient();
  const { data: steamIdentity } = await supabase
    .from("steam_identities")
    .select("steam_id, persona_name, avatar_url, profile_url")
    .eq("user_id", context.user_id)
    .maybeSingle();
  return (
    <div className="grid min-w-0 gap-6 pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={<SignOutButton />}
      />
      <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-xl font-bold text-foreground">{t("summary")}</h2>
          <dl className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("displayName")}</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {context.display_name}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("email")}</dt>
              <dd className="mt-1 break-all font-semibold text-foreground">
                {context.email}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("role")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.role === "admin" ? t("admin") : t("player")}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("gameCharacter")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.player_nickname ?? t("notLinked")}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("guild")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.guild_name ?? t("notLinked")}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>{t("world")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.world_name ?? t("notLinked")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 border border-border" size="lg">
              {steamIdentity?.avatar_url ? (
                <AvatarImage
                  src={steamIdentity.avatar_url}
                  alt={t("steamAvatar")}
                />
              ) : null}
              <AvatarFallback>ST</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {t("steamIdentity")}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {steamIdentity?.persona_name ?? t("steamNotLinked")}
              </p>
            </div>
          </div>
          {steamIdentity === null ? (
            <Button asChild>
              <a
                href={`/api/auth/steam/start?intent=link&next=${encodeURIComponent(`/${locale}/account`)}`}
              >
                {t("linkSteam")}
              </a>
            </Button>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {t("steamLinked")}
            </span>
          )}
        </CardContent>
      </Card>
      <SyncDeviceCard hasBinding={context.binding !== null} />
      {context.binding === null ? (
        <ErrorState code="PLAYER_BINDING_REQUIRED" headingLevel="h2" />
      ) : null}
    </div>
  );
}
