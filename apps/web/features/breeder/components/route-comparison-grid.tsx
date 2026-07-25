import type { BreedingRoute } from "@palhatch/contracts";

import { RouteComparisonCard } from "./route-comparison-card";

export function RouteComparisonGrid({
  routes,
  selectedRouteKey,
  aiDegraded,
  palNames,
  passiveNames,
  onSelect,
}: Readonly<{
  routes: readonly BreedingRoute[];
  selectedRouteKey: string | null;
  aiDegraded: boolean;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  onSelect: (routeKey: string) => void;
}>) {
  const visibleRoutes = [...routes]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3);
  const readyCount = visibleRoutes.filter(
    (route) => route.feasibility_status === "ready",
  ).length;
  const fallbackCount = visibleRoutes.length - readyCount;

  return (
    <section
      className="min-w-0 rounded-[1.75rem] border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-6"
      aria-labelledby="route-comparison-heading"
    >
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            Route comparison
          </p>
          <h2
            id="route-comparison-heading"
            className="mt-1 text-2xl font-bold tracking-tight text-foreground"
          >
            方案比较
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            最多展示三条已确定路线；卡片中的覆盖率、尝试区间和难度均来自算法结果。
          </p>
        </div>
        <p className="flex flex-wrap gap-x-1 rounded-full border border-border bg-white/72 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>库存可执行方案</span>
          <span>{readyCount}</span>
          <span aria-hidden="true">·</span>
          <span>需补充库存的备选方案</span>
          <span>{fallbackCount}</span>
        </p>
      </div>

      <div
        className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
        role="group"
        aria-label="路线方案切换"
      >
        {visibleRoutes.map((route) => (
          <RouteComparisonCard
            key={route.route_key}
            route={route}
            selected={route.route_key === selectedRouteKey}
            aiDegraded={aiDegraded}
            palNames={palNames}
            passiveNames={passiveNames}
            onSelect={() => onSelect(route.route_key)}
          />
        ))}
      </div>
    </section>
  );
}
