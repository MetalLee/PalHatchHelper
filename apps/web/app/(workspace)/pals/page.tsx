import { Boxes, Clock3, PawPrint, RefreshCw, Users } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { PageError } from "@/components/states/page-error";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { requireUserContext } from "@/features/auth/server";
import { PalFilters } from "@/features/pals/pal-filters";
import { PalInventory } from "@/features/pals/pal-inventory";
import { PalPagination } from "@/features/pals/pal-pagination";
import { encodePageContext, parsePalListQuery } from "@/features/pals/query";
import {
  getOverviewSummary,
  listPals,
  loadPassiveRanks,
  Phase5DataError,
} from "@/features/pals/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toUrlSearchParams(values: Awaited<SearchParams>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

function formatDateTime(value: string | null): string {
  if (value === null) return "尚无成功同步";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function InventoryContextError({
  code,
}: Readonly<{
  code: "INVENTORY_SNAPSHOT_CHANGED" | "GAME_DATA_VERSION_CHANGED";
}>) {
  const snapshotChanged = code === "INVENTORY_SNAPSHOT_CHANGED";
  return (
    <PageError
      code={code}
      headingLevel="h1"
      title={snapshotChanged ? "库存快照已更新" : "游戏目录版本已更新"}
      description={
        snapshotChanged
          ? "你正在浏览的稳定分页快照已被新库存取代，请刷新后从第一页继续。"
          : "分页期间游戏目录版本发生变化，请刷新以使用新的固定版本。"
      }
      action={
        <Link
          href="/pals"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          刷新库存
        </Link>
      }
    />
  );
}

export default async function PalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireUserContext();
  if (context.binding === null)
    return <ErrorState code="PLAYER_BINDING_REQUIRED" />;

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
    page = await listPals(query);
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
  let passiveRanks;
  try {
    [summary, passiveRanks] = await Promise.all([
      getOverviewSummary(stableContext),
      loadPassiveRanks(page),
    ]);
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

  const synchronizedAt = formatDateTime(summary.data_status.captured_at);

  return (
    <div className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow="配种库存一览"
        title="帕鲁库存"
        description="查看自己的帕鲁和公会伙伴愿意共享的帕鲁，快速找到适合配种的伙伴。"
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[30%]"
        background={<ForestScenery variant="hero" />}
      />

      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="库存指标"
      >
        <MetricCard
          label="帕鲁总数"
          value={summary.all_count.toLocaleString("zh-CN")}
          icon={Boxes}
          tone="forest"
          compact
        />
        <MetricCard
          label="我的帕鲁"
          value={summary.owned_count.toLocaleString("zh-CN")}
          icon={PawPrint}
          tone="leaf"
          compact
        />
        <MetricCard
          label="公会共享"
          value={summary.shared_count.toLocaleString("zh-CN")}
          icon={Users}
          tone="sky"
          compact
        />
        <MetricCard
          label="最新库存同步"
          value={synchronizedAt}
          icon={Clock3}
          tone="sky"
          compact
        />
      </section>

      <section className="grid min-w-0 gap-3 sm:gap-4" aria-label="库存列表">
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
