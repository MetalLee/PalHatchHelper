import { Boxes, Clock3, PawPrint, RefreshCw, Users } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { PageError } from "@/components/states/page-error";
import { StatusChip } from "@/components/status/status-chip";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { requireUserContext } from "@/features/auth/server";
import { dataStatusPresentation } from "@/features/data-status/presentation";
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

  const status = dataStatusPresentation(summary.data_status.state);
  const synchronizedAt = formatDateTime(summary.data_status.captured_at);

  return (
    <div className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow="Pal inventory"
        title="帕鲁库存"
        description="查看当前可用于配种的自有与公会共享库存，并在安全查询边界内筛选真实实例。"
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[30%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <Link
            href="/data-status"
            className="rounded-full no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <StatusChip tone={status.tone}>
              {status.title} · {synchronizedAt}
            </StatusChip>
          </Link>
        }
      />

      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="库存指标"
      >
        <MetricCard
          label="当前可见总数"
          value={page.total_count.toLocaleString("zh-CN")}
          detail="应用当前范围与筛选后"
          icon={Boxes}
          tone="forest"
        />
        <MetricCard
          label="我的帕鲁"
          value={summary.owned_count.toLocaleString("zh-CN")}
          detail="当前稳定库存快照"
          icon={PawPrint}
          tone="leaf"
        />
        <MetricCard
          label="公会共享"
          value={summary.shared_count.toLocaleString("zh-CN")}
          detail="仅含可安全协作的实例"
          icon={Users}
          tone="sky"
        />
        <MetricCard
          label="最新库存同步"
          value={synchronizedAt}
          detail={status.title}
          icon={Clock3}
          tone="sky"
        />
      </section>

      <PalFilters query={query} page={page} />
      <PalInventory
        key={rawParams.toString()}
        page={page}
        passiveRanks={passiveRanks}
      />
      {page.items.length > 0 ? (
        <PalPagination query={query} page={page} />
      ) : null}
    </div>
  );
}
