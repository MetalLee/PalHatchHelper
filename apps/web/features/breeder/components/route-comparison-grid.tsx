"use client";

import type { BreedingRoute } from "@palhatch/contracts";

import { useCopy } from "@/i18n/client";

import { RouteComparisonCard } from "./route-comparison-card";

export function RouteComparisonGrid({
  routes,
  selectedRouteKey,
  onSelect,
}: Readonly<{
  routes: readonly BreedingRoute[];
  selectedRouteKey: string | null;
  onSelect: (routeKey: string) => void;
}>) {
  const t = useCopy("Breeder");
  const visibleRoutes = [...routes]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3);
  const readyCount = visibleRoutes.filter(
    (route) => route.feasibility_status === "ready",
  ).length;
  const fallbackCount = visibleRoutes.length - readyCount;

  return (
    <section
      className="min-w-0 rounded-[1.75rem] border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md"
      aria-labelledby="route-comparison-heading"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="route-comparison-heading"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            {t("comparisonTitle")}
          </h2>
        </div>
        <p className="flex flex-wrap gap-x-1 rounded-full border border-border bg-white/72 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <span>{t("readyRouteCount", { count: readyCount })}</span>
          <span aria-hidden="true">·</span>
          <span>{t("fallbackRouteCount", { count: fallbackCount })}</span>
        </p>
      </div>

      <div
        className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3"
        role="group"
        aria-label={t("routeSwitcher")}
      >
        {visibleRoutes.map((route) => (
          <RouteComparisonCard
            key={route.route_key}
            route={route}
            selected={route.route_key === selectedRouteKey}
            onSelect={() => onSelect(route.route_key)}
          />
        ))}
      </div>
    </section>
  );
}
