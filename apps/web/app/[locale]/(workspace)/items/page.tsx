import { Boxes, Clock3, Factory, MapPinned } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MetricCard } from "@/components/dashboard/metric-card";
import { VisitorDateTime } from "@/components/formatters/visitor-date-time";
import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Card, CardContent } from "@/components/ui/card";
import { requireUserContext } from "@/features/auth/server";
import { ItemInventoryFilters } from "@/features/items/item-inventory-filters";
import { ItemInventoryList } from "@/features/items/item-inventory-list";
import { ItemInventoryPagination } from "@/features/items/item-inventory-pagination";
import {
  alphabeticIndex,
  parseItemInventoryQuery,
  prepareItemInventoryPage,
} from "@/features/items/query";
import { getGuildItemInventory } from "@/features/items/server";
import { getInventoryDataStatus } from "@/features/pals/server";
import { Phase5DataError } from "@/features/phase5-errors";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toUrlSearchParams(values: Awaited<SearchParams>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  return params;
}

export default async function ItemsPage({
  searchParams,
  params,
}: {
  searchParams: SearchParams;
  params: Promise<{ locale: string }>;
}) {
  const locale = requireAppLocale((await params).locale);
  const catalogLocale = catalogLocaleFor(locale);
  const t = await getTranslations({ locale, namespace: "Items" });
  const context = await requireUserContext();
  if (context.binding === null) return <PlayerBindingSetup />;

  let inventory;
  let dataStatus;
  try {
    [inventory, dataStatus] = await Promise.all([
      getGuildItemInventory(catalogLocale),
      getInventoryDataStatus(),
    ]);
  } catch (error) {
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }

  const query = parseItemInventoryQuery(toUrlSearchParams(await searchParams));
  const page = prepareItemInventoryPage(inventory.items, query, catalogLocale);
  const baseIds = Array.from(
    new Set(
      inventory.items.flatMap((item) => item.bases.map((base) => base.base_id)),
    ),
  ).sort();
  const baseLabels = Object.fromEntries(
    baseIds.map((baseId, index) => [
      baseId,
      t("baseName", { label: alphabeticIndex(index) }),
    ]),
  );
  const totalQuantity = inventory.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const capturedAt =
    dataStatus.last_heartbeat_at === null ? (
      t("notAvailable")
    ) : (
      <VisitorDateTime
        value={dataStatus.last_heartbeat_at}
        locale={catalogLocale}
        options={{ dateStyle: "short", timeStyle: "short" }}
      />
    );

  return (
    <div className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[30%]"
        background={<ForestScenery variant="hero" />}
      />

      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label={t("metricsLabel")}
      >
        <MetricCard
          label={t("itemKinds")}
          value={inventory.items.length.toLocaleString(catalogLocale)}
          icon={Boxes}
          tone="forest"
          compact
        />
        <MetricCard
          label={t("totalStock")}
          value={totalQuantity.toLocaleString(catalogLocale)}
          icon={Factory}
          tone="leaf"
          compact
        />
        <MetricCard
          label={t("baseCount")}
          value={baseIds.length.toLocaleString(catalogLocale)}
          icon={MapPinned}
          tone="sky"
          compact
        />
        <MetricCard
          label={t("latestSync")}
          value={capturedAt}
          icon={Clock3}
          tone="sky"
          compact
        />
      </section>

      <Card className="gap-0 overflow-hidden border-glass-border bg-white/82 py-0 shadow-soft">
        <CardContent className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5">
          <ItemInventoryFilters query={query} />
          {inventory.status === "unavailable" ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("unavailable")}
            </div>
          ) : page.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <p className="text-xs font-medium text-muted-foreground">
              {t("resultCount", { count: page.totalCount })}
            </p>
          )}
        </CardContent>

        {inventory.status !== "unavailable" && page.items.length > 0 ? (
          <>
            <ItemInventoryList
              items={page.items}
              baseLabels={baseLabels}
              catalogLocale={catalogLocale}
            />
            <ItemInventoryPagination
              query={query}
              pageNumber={page.pageNumber}
              totalPages={page.totalPages}
            />
          </>
        ) : null}
      </Card>
    </div>
  );
}
