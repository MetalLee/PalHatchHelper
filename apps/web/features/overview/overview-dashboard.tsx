import type { OverviewSummary, PlanSummary } from "@palhatch/contracts";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Clock3,
  Dna,
  PawPrint,
  Sprout,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHero } from "@/components/layout/page-hero";
import { PageError } from "@/components/states/page-error";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { GlassPanel } from "@/components/surfaces/glass-panel";
import { StatusChip } from "@/components/status/status-chip";
import { Card, CardContent } from "@/components/ui/card";
import { dataStatusPresentation } from "@/features/data-status/presentation";
import { cn } from "@/lib/utils";

export interface OverviewPlanFeed {
  active: PlanSummary[];
  awaitingConfirmation: PlanSummary[];
  completed: PlanSummary[];
  unavailable: boolean;
}

const planStatusLabels: Record<PlanSummary["status"], string> = {
  active: "进行中",
  awaiting_confirmation: "待确认",
  paused: "已暂停",
  completed: "已完成",
  invalidated: "已失效",
  cancelled: "已取消",
};

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

function PlanRow({
  plan,
  compact = false,
}: Readonly<{ plan: PlanSummary; compact?: boolean }>) {
  return (
    <Link
      href={`/plans/${plan.plan_id}`}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-2xl bg-white/68 p-3 text-foreground no-underline shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        compact ? "sm:p-3.5" : "p-4 sm:p-5",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-2xl",
          plan.status === "awaiting_confirmation"
            ? "bg-amber-100 text-amber-800"
            : plan.status === "completed"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-accent text-primary",
          compact ? "size-10" : "size-12",
        )}
      >
        <ClipboardList
          aria-hidden="true"
          className={compact ? "size-5" : "size-6"}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm sm:text-base">
            {plan.target_pal_display_name}
          </strong>
          <StatusChip
            tone={
              plan.status === "awaiting_confirmation"
                ? "warning"
                : plan.status === "completed"
                  ? "good"
                  : "neutral"
            }
          >
            {planStatusLabels[plan.status]}
          </StatusChip>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          步骤 {Math.min(plan.current_step_index + 1, plan.total_step_count)} /{" "}
          {plan.total_step_count}
          {plan.pending_candidate_count > 0
            ? ` · ${plan.pending_candidate_count} 个候选子代`
            : ""}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function QuickEntry({
  href,
  title,
  description,
  icon: Icon,
  tone,
}: Readonly<{
  href: string;
  title: string;
  description: string;
  icon: typeof Dna;
  tone: "forest" | "sky" | "leaf";
}>) {
  const toneClass = {
    forest: "bg-primary/10 text-primary",
    sky: "bg-sky/20 text-sky-900",
    leaf: "bg-leaf/16 text-forest",
  }[tone];

  return (
    <Link
      href={href}
      className="group flex min-h-32 min-w-0 items-center gap-4 rounded-2xl border border-glass-border bg-white/78 p-5 text-foreground no-underline shadow-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-2xl",
          toneClass,
        )}
      >
        <Icon aria-hidden="true" className="size-6" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <strong className="flex items-center gap-1.5 text-base">
          {title}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5"
          />
        </strong>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

export function OverviewDashboard({
  playerNickname,
  worldName,
  guildName,
  summary,
  planFeed,
}: Readonly<{
  playerNickname: string;
  worldName: string;
  guildName: string | null;
  summary: OverviewSummary;
  planFeed: OverviewPlanFeed;
}>) {
  const status = dataStatusPresentation(summary.data_status.state);
  const focusPlan =
    planFeed.awaitingConfirmation[0] ?? planFeed.active[0] ?? null;
  const remainingPlans = [
    ...planFeed.awaitingConfirmation.slice(
      focusPlan?.status === "awaiting_confirmation" ? 1 : 0,
    ),
    ...planFeed.active.slice(focusPlan?.status === "active" ? 1 : 0),
  ].slice(0, 3);

  return (
    <div
      className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8"
      data-testid="overview-dashboard"
    >
      <PageHero
        eyebrow="Breeding workspace"
        title={`欢迎回来，${playerNickname}`}
        description={`${worldName} · ${guildName ?? "未加入公会"}。从真实库存出发，比较确定性路线并人工推进每一步。`}
        className="min-h-[21rem] border-white/80 bg-white/72 sm:min-h-[22rem] lg:min-h-[21rem] lg:pr-[32%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <>
            <Link href="/breeder" className={primaryLinkClass}>
              <Sprout aria-hidden="true" className="size-4" />
              开始配种
            </Link>
            <Link
              href="/pals"
              className={cn(outlineLinkClass, "min-h-12 px-6")}
            >
              <Warehouse aria-hidden="true" className="size-4" />
              查看库存
            </Link>
            <Link
              href="/data-status"
              className="rounded-full no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <StatusChip tone={status.tone}>
                最新同步 {formatDateTime(summary.data_status.captured_at)}
              </StatusChip>
            </Link>
          </>
        }
      />

      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="库存概览"
      >
        <MetricCard
          label="可用候选池"
          value={summary.all_count.toLocaleString("zh-CN")}
          detail="自有 + 当前可共享"
          icon={Boxes}
          tone="forest"
        />
        <MetricCard
          label="我的帕鲁"
          value={summary.owned_count.toLocaleString("zh-CN")}
          detail="完整库存仅你可见"
          icon={PawPrint}
          tone="leaf"
        />
        <MetricCard
          label="公会共享"
          value={summary.shared_count.toLocaleString("zh-CN")}
          detail="仅含配种所需字段"
          icon={Users}
          tone="sky"
        />
        <MetricCard
          label="最新库存同步"
          value={formatDateTime(summary.data_status.captured_at)}
          detail={status.title}
          icon={Clock3}
          tone="sky"
        />
      </section>

      <section
        className="grid min-w-0 gap-3 md:grid-cols-3"
        aria-label="工作台快捷入口"
      >
        <QuickEntry
          href="/breeder"
          title="配种工作台"
          description="选择目标与期望被动，计算并比较真实合法路线。"
          icon={Dna}
          tone="forest"
        />
        <QuickEntry
          href="/pals"
          title="帕鲁库存"
          description="查看自有与公会共享候选，并管理自己的共享状态。"
          icon={Warehouse}
          tone="leaf"
        />
        <QuickEntry
          href="/plans"
          title="我的计划"
          description="人工推进已采用路线，并确认真实候选子代。"
          icon={ClipboardList}
          tone="sky"
        />
      </section>

      {planFeed.unavailable ? (
        <PageError
          code="DATA_UNAVAILABLE"
          title="部分计划数据暂不可用"
          description="库存统计仍来自当前真实快照；计划区域不会用占位数字代替失败查询。"
        />
      ) : null}

      <section
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]"
        aria-labelledby="current-plan-heading"
      >
        <Card className="min-w-0 border-glass-border bg-card/90 py-0 shadow-soft">
          <CardContent className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
                  Current work
                </p>
                <h2
                  id="current-plan-heading"
                  className="mt-2 text-xl font-bold tracking-tight sm:text-2xl"
                >
                  当前计划与待确认子代
                </h2>
              </div>
              <Link href="/plans" className={ghostLinkClass}>
                查看全部
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>

            <div className="mt-5 grid min-w-0 gap-3">
              {focusPlan ? (
                <PlanRow plan={focusPlan} />
              ) : planFeed.unavailable ? (
                <div className="rounded-2xl bg-muted/64 p-5 text-sm leading-6 text-muted-foreground">
                  当前计划暂时无法确认，恢复查询前不会显示空计划结论。
                </div>
              ) : (
                <div className="rounded-2xl bg-muted/64 p-5">
                  <h3 className="font-semibold text-foreground">
                    暂无进行中的计划
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    从配种工作台选择目标，采用库存完整的路线后即可开始。
                  </p>
                  <Link
                    href="/breeder"
                    className={cn(primaryLinkClass, "mt-4 min-h-11 px-4")}
                  >
                    开始配种
                  </Link>
                </div>
              )}
              {remainingPlans.map((plan) => (
                <PlanRow key={plan.plan_id} plan={plan} compact />
              ))}
            </div>
          </CardContent>
        </Card>

        <GlassPanel
          className="min-w-0 bg-white/78"
          aria-labelledby="data-status-heading"
        >
          <div role="status" aria-live="polite">
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Data status
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2
                id="data-status-heading"
                className="text-xl font-bold tracking-tight"
              >
                数据状态
              </h2>
              <StatusChip tone={status.tone}>{status.title}</StatusChip>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {status.description}
            </p>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">最新同步</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {formatDateTime(summary.data_status.captured_at)}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">游戏数据</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {summary.data_status.game_version ??
                  summary.data_status.game_data_version_id?.slice(0, 8) ??
                  "尚未配置"}
              </dd>
            </div>
            <div className="rounded-xl bg-white/72 p-3">
              <dt className="text-muted-foreground">确定性算法</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {summary.data_status.algorithm_version ?? "尚未提供"}
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

      <section className="min-w-0" aria-labelledby="recent-plans-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Recent
            </p>
            <h2
              id="recent-plans-heading"
              className="mt-2 text-xl font-bold tracking-tight sm:text-2xl"
            >
              最近完成计划
            </h2>
          </div>
          <Link href="/plans?status=completed" className={ghostLinkClass}>
            查看完成记录
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {planFeed.completed.length > 0 ? (
          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
            {planFeed.completed.slice(0, 4).map((plan) => (
              <PlanRow key={plan.plan_id} plan={plan} compact />
            ))}
          </div>
        ) : planFeed.unavailable ? (
          <div className="mt-4 rounded-2xl bg-white/58 p-5 text-sm text-muted-foreground">
            完成记录暂时无法确认，恢复查询前不会显示空记录结论。
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-white/58 p-5 text-sm text-muted-foreground">
            暂无已完成计划。完成记录会保留固定库存、游戏数据、算法与评分版本。
          </div>
        )}
      </section>
    </div>
  );
}
