import { Boxes, Clock3, PawPrint, RefreshCw, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MetricCard } from "@/components/dashboard/metric-card";
import { VisitorDateTime } from "@/components/formatters/visitor-date-time";
import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { PageError } from "@/components/states/page-error";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { requireUserContext } from "@/features/auth/server";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import { PalFilters } from "@/features/pals/pal-filters";
import { PalInventory } from "@/features/pals/pal-inventory";
import { PalPagination } from "@/features/pals/pal-pagination";
import { encodePageContext, parsePalListQuery } from "@/features/pals/query";
import {
  getOverviewSummary,
  listPals,
  passiveRanksFromPage,
  Phase5DataError,
} from "@/features/pals/server";
import { Link } from "@/i18n/navigation";
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

async function InventoryContextError({
  code,
}: Readonly<{
  code: "INVENTORY_SNAPSHOT_CHANGED" | "GAME_DATA_VERSION_CHANGED";
}>) {
  const t = await getTranslations("Pals");
  const snapshotChanged = code === "INVENTORY_SNAPSHOT_CHANGED";
  return (
    <PageError
      code={code}
      headingLevel="h1"
      title={snapshotChanged ? t("snapshotChanged") : t("catalogChanged")}
      description={
        snapshotChanged
          ? t("snapshotChangedDescription")
          : t("catalogChangedDescription")
      }
      action={
        <Link
          href="/pals"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("refresh")}
        </Link>
      }
    />
  );
}

export default async function PalsPage({
  searchParams,
  params,
}: {
  searchParams: SearchParams;
  params: Promise<{ locale: string }>;
}) {
  const locale = requireAppLocale((await params).locale);
  const catalogLocale = catalogLocaleFor(locale);
  const t = await getTranslations({ locale, namespace: "Pals" });
  const context = await requireUserContext();
  if (context.binding === null) return <PlayerBindingSetup />;

  const rawParams = toUrlSearchParams(await searchParams);
  const query = parsePalListQuery(rawParams);
  const cardParams = new URLSearchParams(rawParams);
  cardParams.delete("view");
  cardParams.delete("page");
  cardParams.delete("context");
  const tableParams = new URLSearchParams(cardParams);
  tableParams.set("view", "table");
  const viewHrefs = {
    cards: `/pals${cardParams.size > 0 ? `?${cardParams.toString()}` : ""}`,
    table: `/pals?${tableParams.toString()}`,
  } as const;

  let page;
  try {
    page = await listPals(query, undefined, catalogLocale);
  } catch (error) {
    const code =
      error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE";
    return code === "INVENTORY_SNAPSHOT_CHANGED" ||
      code === "GAME_DATA_VERSION_CHANGED" ? (
      <InventoryContextError code={code} />
    ) : (
      <ErrorState code={code} />
    );
  }

  const stableContext =
    page.snapshot_id === null
      ? null
      : encodePageContext({
          snapshot_id: page.snapshot_id,
          game_data_version_id: page.game_data_version_id,
        });

  let summary;
  try {
    summary = await getOverviewSummary(stableContext, catalogLocale);
  } catch (error) {
    const code =
      error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE";
    return code === "INVENTORY_SNAPSHOT_CHANGED" ||
      code === "GAME_DATA_VERSION_CHANGED" ? (
      <InventoryContextError code={code} />
    ) : (
      <ErrorState code={code} />
    );
  }

  const passiveRanks = passiveRanksFromPage(page);

  const synchronizedAt =
    summary.data_status.captured_at === null ? (
      t("noSync")
    ) : (
      <VisitorDateTime
        value={summary.data_status.captured_at}
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
          label={t("total")}
          value={summary.all_count.toLocaleString(catalogLocale)}
          icon={Boxes}
          tone="forest"
          compact
        />
        <MetricCard
          label={t("mine")}
          value={summary.owned_count.toLocaleString(catalogLocale)}
          icon={PawPrint}
          tone="leaf"
          compact
        />
        <MetricCard
          label={t("guildShared")}
          value={summary.shared_count.toLocaleString(catalogLocale)}
          icon={Users}
          tone="sky"
          compact
        />
        <MetricCard
          label={t("latestSync")}
          value={synchronizedAt}
          icon={Clock3}
          tone="sky"
          compact
        />
      </section>

      <section
        className="grid min-w-0 gap-3 sm:gap-4"
        aria-label={t("listLabel")}
      >
        <PalFilters query={query} page={page} viewHrefs={viewHrefs} />
        <PalInventory
          key={rawParams.toString()}
          page={page}
          view={query.view}
          passiveRanks={passiveRanks}
        />
        {page.items.length > 0 ? (
          <PalPagination query={query} page={page} />
        ) : null}
      </section>
    </div>
  );
}
