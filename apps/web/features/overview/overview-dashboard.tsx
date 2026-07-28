"use client";

import type { InventoryDataStatus, PlanSummary } from "@palhatch/contracts";
import { ArrowRight, Dna, PawPrint } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PageError } from "@/components/states/page-error";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { GlassPanel } from "@/components/surfaces/glass-panel";
import { StatusChip } from "@/components/status/status-chip";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLocale, useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { userFacingCatalogName } from "@/lib/user-facing-name";

export interface OverviewPlanFeed {
  items: PlanSummary[];
  unavailable: boolean;
}

const primaryLinkClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground no-underline shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const outlineLinkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white/72 px-4 text-sm font-semibold text-foreground no-underline shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const ghostLinkClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary no-underline transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

function formatDateTime(
  value: string | null,
  locale: "zh" | "en",
  emptyValue: string,
): string {
  if (value === null) return emptyValue;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function PlanRow({ plan }: Readonly<{ plan: PlanSummary }>) {
  const locale = useAppLocale();
  const t = useCopy("Overview");
  const targetName = userFacingCatalogName(
    plan.target_pal_display_name,
    plan.target_pal_id,
    t("nameUnavailable"),
  );
  return (
    <Link
      href={`/plans/${plan.route_id}`}
      className="group flex min-w-0 items-center gap-3 rounded-2xl bg-white/68 p-4 text-foreground no-underline shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent/70 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:bg-accent/70 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 motion-reduce:transform-none"
    >
      <PalPortrait palId={plan.target_pal_id} name={targetName} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm sm:text-base">
            {targetName}
          </strong>
          <StatusChip
            tone={plan.feasibility_status === "ready" ? "good" : "warning"}
          >
            {plan.feasibility_status === "ready"
              ? t("inventoryReady")
              : t("inventoryMissing")}
          </StatusChip>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {t("planMeta", {
            generations: plan.generation_count,
            steps: plan.step_count,
            date: formatDateTime(plan.saved_at, locale, t("noSuccessfulSync")),
          })}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export function OverviewDashboard({
  playerNickname,
  worldName,
  guildName,
  dataStatus,
  planFeed,
}: Readonly<{
  playerNickname: string;
  worldName: string;
  guildName: string | null;
  dataStatus: InventoryDataStatus;
  planFeed: OverviewPlanFeed;
}>) {
  const locale = useAppLocale();
  const t = useCopy("Overview");
  return (
    <div
      className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8"
      data-testid="overview-dashboard"
    >
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("welcome", { name: playerNickname })}
        description={`${worldName} · ${guildName ?? t("noGuild")}`}
        className="min-h-[21rem] border-white/80 bg-white/72 sm:min-h-[22rem] lg:min-h-[21rem] lg:pr-[32%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <>
            <Link href="/breeder" className={primaryLinkClass}>
              <Dna aria-hidden="true" className="size-4" />
              {t("startBreeding")}
            </Link>
            <Link
              href="/pals"
              className={cn(outlineLinkClass, "min-h-12 px-6")}
            >
              <PawPrint aria-hidden="true" className="size-4" />
              {t("viewPals")}
            </Link>
          </>
        }
      />

      {planFeed.unavailable ? (
        <PageError
          code="DATA_UNAVAILABLE"
          title={t("planUnavailableTitle")}
          description={t("planUnavailableDescription")}
        />
      ) : null}

      <section
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]"
        aria-labelledby="saved-plans-heading"
      >
        <Card className="min-w-0 border-glass-border bg-card/90 py-0 shadow-soft">
          <CardContent className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
                  {t("savedRoutes")}
                </p>
                <h2
                  id="saved-plans-heading"
                  className="mt-2 text-xl font-bold tracking-tight sm:text-2xl"
                >
                  {t("recentPlans")}
                </h2>
              </div>
              <Link href="/plans" className={ghostLinkClass}>
                {t("viewAll")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="mt-5 grid min-w-0 gap-3">
              {planFeed.items.length > 0 ? (
                planFeed.items.map((plan) => (
                  <PlanRow key={plan.route_id} plan={plan} />
                ))
              ) : planFeed.unavailable ? (
                <div className="rounded-2xl bg-muted/64 p-5 text-sm leading-6 text-muted-foreground">
                  {t("savedUnavailable")}
                </div>
              ) : (
                <div className="rounded-2xl bg-muted/64 p-5">
                  <h3 className="font-semibold text-foreground">
                    {t("emptyTitle")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("emptyDescription")}
                  </p>
                  <Link
                    href="/breeder"
                    className={cn(primaryLinkClass, "mt-4 min-h-11 px-4")}
                  >
                    {t("openBreeder")}
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <GlassPanel
          className="min-w-0 bg-white/78"
          aria-labelledby="data-status-heading"
        >
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              {t("beaconStatus")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2
                id="data-status-heading"
                className="text-xl font-bold tracking-tight"
              >
                {t("baseline")}
              </h2>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">{t("latestSync")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {formatDateTime(
                  dataStatus.captured_at,
                  locale,
                  t("noSuccessfulSync"),
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">{t("gameData")}</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {dataStatus.game_version ??
                  dataStatus.game_data_version_id?.slice(0, 8) ??
                  t("notConfigured")}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">{t("algorithm")}</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {dataStatus.algorithm_version ?? t("notProvided")}
              </dd>
            </div>
          </dl>
          <Link
            href="/data-status"
            className={cn(outlineLinkClass, "mt-5 w-full")}
          >
            {t("viewDetails")}
          </Link>
        </GlassPanel>
      </section>
    </div>
  );
}
