"use client";

import type { BreedingRoute } from "@palhatch/contracts";
import {
  Check,
  Clock3,
  GitBranch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function RouteComparisonCard({
  route,
  selected,
  onSelect,
}: Readonly<{
  route: BreedingRoute;
  selected: boolean;
  onSelect: () => void;
}>) {
  const t = useCopy("Breeder");
  const ready = route.feasibility_status === "ready";
  const accessibleName = ready
    ? t("readyRouteLabel", { rank: route.rank })
    : t("fallbackRouteLabel", { rank: route.rank });

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={selected}
      onClick={onSelect}
      data-density="compact"
      className={cn(
        "group relative flex h-full min-h-11 w-full min-w-0 cursor-pointer flex-col rounded-2xl border bg-white/82 p-4 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-200 outline-none motion-reduce:transition-none",
        "hover:border-primary/45 hover:bg-white focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
        selected
          ? "border-primary bg-emerald-50/82 shadow-[0_18px_44px_rgb(40_122_84_/_0.16)]"
          : "border-border",
      )}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-base font-bold text-foreground">
          {t("routeTitle", {
            rank: route.rank,
            mode: t(route.optimization_mode),
          })}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-primary text-white"
              : "border-border bg-white text-transparent",
          )}
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      </span>

      <span className="mt-2 flex flex-wrap gap-1.5">
        <Badge
          variant="outline"
          className={
            ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-orange-200 bg-orange-50 text-orange-800"
          }
        >
          {ready ? (
            <ShieldCheck aria-hidden="true" />
          ) : (
            <TriangleAlert aria-hidden="true" />
          )}
          {ready ? t("ready") : t("needsInventory")}
        </Badge>
      </span>

      <span className="mt-3 grid grid-cols-[auto_1fr] items-end gap-3 border-b border-border pb-3">
        <span>
          <span className="block text-xs font-semibold text-muted-foreground">
            {t("totalScore")}
          </span>
          <span className="block text-3xl font-bold tracking-[-0.04em] text-primary tabular-nums">
            {route.total_score.toFixed(2)}
          </span>
        </span>
        <span className="grid justify-items-end gap-1 text-right text-xs">
          <span className="font-semibold text-foreground">
            {t("difficulty", { value: t(route.difficulty) })}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3.5 text-primary" />
            {t("attemptCount", {
              min: route.estimated_attempts_min,
              max: route.estimated_attempts_max,
            })}
          </span>
        </span>
      </span>

      <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <Metric
          icon={GitBranch}
          label={t("generations")}
          value={t("generationCount", { count: route.generation_count })}
        />
        <Metric
          icon={Users}
          label={t("guildBorrowing")}
          value={t("palCount", { count: route.borrowed_pal_count })}
        />
        <Metric
          icon={ShieldCheck}
          label={t("inventoryCoverage")}
          value={`${Math.round(route.inventory_coverage * 100)}%`}
        />
        <Metric
          icon={Sparkles}
          label={t("passiveCoverage")}
          value={`${Math.round(route.inventory_passive_coverage * 100)}%`}
        />
      </span>

      {route.missing_pal_count > 0 || route.missing_passive_ids.length > 0 ? (
        <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-orange-200 bg-orange-50/88 px-3 py-2 text-xs font-semibold text-orange-950">
          {route.missing_pal_count > 0 ? (
            <span>
              {t("missingParents", { count: route.missing_pal_count })}
            </span>
          ) : null}
          {route.missing_passive_ids.length > 0 ? (
            <span>
              {t("missingPassiveCount", {
                count: route.missing_passive_ids.length,
              })}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  className,
}: Readonly<{
  icon: typeof GitBranch;
  label: string;
  value: string;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-1.5",
        className,
      )}
    >
      <Icon aria-hidden="true" className="row-span-2 size-3.5 text-primary" />
      <span className="text-[0.68rem] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-sm font-bold text-foreground tabular-nums">
        {value}
      </span>
    </span>
  );
}
