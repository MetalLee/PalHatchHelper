import type { InventoryDataStatus, PlanSummary } from "@palhatch/contracts";
import { ArrowRight, Dna, Rabbit } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/layout/page-hero";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PageError } from "@/components/states/page-error";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { GlassPanel } from "@/components/surfaces/glass-panel";
import { StatusChip } from "@/components/status/status-chip";
import { Card, CardContent } from "@/components/ui/card";
import { dataStatusPresentation } from "@/features/data-status/presentation";
import { cn } from "@/lib/utils";

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

function formatDateTime(value: string | null): string {
  if (value === null) return "尚无成功同步";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function PlanRow({ plan }: Readonly<{ plan: PlanSummary }>) {
  return (
    <Link
      href={`/plans/${plan.route_id}`}
      className="group flex min-w-0 items-center gap-3 rounded-2xl bg-white/68 p-4 text-foreground no-underline shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <PalPortrait
        palId={plan.target_pal_id}
        name={plan.target_pal_display_name}
        size={44}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm sm:text-base">
            {plan.target_pal_display_name}
          </strong>
          <StatusChip
            tone={plan.feasibility_status === "ready" ? "good" : "warning"}
          >
            {plan.feasibility_status === "ready" ? "库存可执行" : "需补库存"}
          </StatusChip>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {plan.generation_count} 代 · {plan.step_count} 步 · 保存于{" "}
          {formatDateTime(plan.saved_at)}
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
  const status = dataStatusPresentation(dataStatus.state);
  return (
    <div
      className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8"
      data-testid="overview-dashboard"
    >
      <PageHero
        eyebrow="PALWORLD SERVER CONSOLE"
        title={`欢迎回来，${playerNickname}`}
        description={`${worldName} · ${guildName ?? "未加入公会"}`}
        className="min-h-[21rem] border-white/80 bg-white/72 sm:min-h-[22rem] lg:min-h-[21rem] lg:pr-[32%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <>
            <Link href="/breeder" className={primaryLinkClass}>
              <Dna aria-hidden="true" className="size-4" />
              开始配种
            </Link>
            <Link
              href="/pals"
              className={cn(outlineLinkClass, "min-h-12 px-6")}
            >
              <Rabbit aria-hidden="true" className="size-4" />
              查看帕鲁
            </Link>
            <Link
              href="/data-status"
              className="rounded-full no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <StatusChip tone={status.tone}>
                {dataStatus.state === "healthy"
                  ? `最新同步 ${formatDateTime(dataStatus.captured_at)}`
                  : status.title}
              </StatusChip>
            </Link>
          </>
        }
      />

      {planFeed.unavailable ? (
        <PageError
          code="DATA_UNAVAILABLE"
          title="计划数据暂不可用"
          description="库存统计仍来自当前真实快照；收藏区域不会用占位数据代替失败查询。"
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
                  Saved routes
                </p>
                <h2
                  id="saved-plans-heading"
                  className="mt-2 text-xl font-bold tracking-tight sm:text-2xl"
                >
                  最近收藏的计划
                </h2>
              </div>
              <Link href="/plans" className={ghostLinkClass}>
                查看全部
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
                  收藏计划暂时无法确认。
                </div>
              ) : (
                <div className="rounded-2xl bg-muted/64 p-5">
                  <h3 className="font-semibold text-foreground">
                    暂无收藏计划
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    在配种结果中保存路线后，可从这里快速返回。
                  </p>
                  <Link
                    href="/breeder"
                    className={cn(primaryLinkClass, "mt-4 min-h-11 px-4")}
                  >
                    打开配种器
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
          <div role="status" aria-live="polite">
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Beacon status
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2
                id="data-status-heading"
                className="text-xl font-bold tracking-tight"
              >
                服务器数据状态
              </h2>
              <StatusChip tone={status.tone}>{status.title}</StatusChip>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">最新同步</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {formatDateTime(dataStatus.captured_at)}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">游戏数据</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {dataStatus.game_version ??
                  dataStatus.game_data_version_id?.slice(0, 8) ??
                  "尚未配置"}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">确定性算法</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {dataStatus.algorithm_version ?? "尚未提供"}
              </dd>
            </div>
          </dl>
          <Link
            href="/data-status"
            className={cn(outlineLinkClass, "mt-5 w-full")}
          >
            查看详细状态
          </Link>
        </GlassPanel>
      </section>
    </div>
  );
}
