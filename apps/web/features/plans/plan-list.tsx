"use client";

import type { PlanListPage, PlanSummary } from "@palhatch/contracts";
import { ChevronRight, GitBranch, Sparkles } from "lucide-react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { VisitorDateTime } from "@/components/formatters/visitor-date-time";
import { StatusChip } from "@/components/status/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLocale, useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { catalogLocaleFor } from "@/i18n/routing";
import { userFacingCatalogName } from "@/lib/user-facing-name";

export function PlanList({ page }: Readonly<{ page: PlanListPage }>) {
  const t = useCopy("Plans");
  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
      {page.items.length === 0 ? (
        <Card className="border-dashed border-glass-border bg-white/78 shadow-soft">
          <CardContent className="grid justify-items-start gap-3 p-6 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {t("emptyTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
            <Button asChild>
              <Link href="/breeder">{t("start")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),32rem))] justify-start gap-3"
          aria-label={t("listLabel")}
        >
          {page.items.map((plan) => (
            <PlanCard key={plan.route_id} plan={plan} />
          ))}
        </section>
      )}

      {page.next_cursor === null ? null : (
        <Button variant="outline" asChild className="justify-self-center">
          <Link
            href={`/plans?cursor=${encodeURIComponent(page.next_cursor)}&boundary=${encodeURIComponent(page.query_boundary)}`}
          >
            {t("next")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function PlanCard({ plan }: Readonly<{ plan: PlanSummary }>) {
  const locale = useAppLocale();
  const t = useCopy("Plans");
  const targetName = userFacingCatalogName(
    plan.target_pal_display_name,
    plan.target_pal_id,
    t("nameUnavailable"),
  );
  return (
    <Card
      data-plan-card
      className="h-full w-full max-w-[32rem] min-w-0 gap-0 overflow-hidden border-glass-border bg-card/92 py-0 shadow-soft transition-colors hover:border-primary/25"
    >
      <CardContent className="grid h-full min-w-0 content-start gap-5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <PalPortrait palId={plan.target_pal_id} name={targetName} size={60} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={plan.feasibility_status === "ready" ? "good" : "warning"}
              >
                {plan.feasibility_status === "ready"
                  ? t("ready")
                  : t("needsPals")}
              </StatusChip>
              <span className="text-xs text-muted-foreground">
                {t("savedAt", {
                  date: "",
                })}
                <VisitorDateTime
                  value={plan.saved_at}
                  locale={catalogLocaleFor(locale)}
                  options={{ dateStyle: "short", timeStyle: "short" }}
                />
              </span>
            </div>
            <h2 className="mt-2 truncate text-lg font-bold text-foreground">
              {targetName}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <GitBranch aria-hidden="true" className="size-4" />
              {t("routeMeta", {
                generations: plan.generation_count,
                steps: plan.step_count,
                borrowed: plan.borrowed_pal_count,
              })}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {t("desiredPassives")}
          </p>
          {plan.desired_passives.length === 0 ? (
            <p className="mt-2 min-h-[3.875rem] text-sm text-muted-foreground">
              {t("noDesiredPassives")}
            </p>
          ) : (
            <div
              className="mt-2 grid min-h-[3.875rem] auto-rows-min grid-cols-2 content-start items-start gap-1.5"
              data-passive-layout="2x2"
            >
              {plan.desired_passives.map((passive) => (
                <PassiveBadge
                  key={passive.passive_skill_id}
                  name={userFacingCatalogName(
                    passive.display_name,
                    passive.passive_skill_id,
                    t("passiveNameUnavailable"),
                  )}
                  rank={passive.rank}
                  isNegative={passive.is_negative}
                  className="w-full min-w-0 justify-start truncate"
                />
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/55 p-4 text-sm sm:grid-cols-4">
          <Metric label={t("score")} value={plan.total_score.toFixed(2)} />
          <Metric
            label={t("attempts")}
            value={t("attemptValue", {
              min: plan.estimated_attempts_min,
              max: plan.estimated_attempts_max,
            })}
          />
          <Metric label={t("difficulty")} value={t(plan.difficulty)} />
          <Metric
            label={t("missing")}
            value={t("palCount", { count: plan.missing_pal_count })}
          />
        </dl>

        <Button asChild className="mt-auto w-full">
          <Link href={`/plans/${plan.route_id}`}>
            {t("view")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}
