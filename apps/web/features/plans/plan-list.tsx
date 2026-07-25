"use client";

import type {
  InvalidationReason,
  PlanListPage,
  PlanStatus,
  PlanSummary,
} from "@palhatch/contracts";
import {
  Activity,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  formatPlanDateTime,
  invalidationReasonDescriptions,
  nextPlanActionLabel,
  planStatusLabels,
  planStatusTone,
} from "./presentation";
import type { PlanStatusFilter } from "./server";

const filters: readonly [PlanStatusFilter, string][] = [
  ["all", "全部"],
  ["active", "进行中"],
  ["awaiting_confirmation", "待确认"],
  ["completed", "已完成"],
  ["paused", "已暂停"],
  ["invalidated", "已失效"],
];
const filterContentValues: readonly PlanStatusFilter[] = [
  ...filters.map(([value]) => value),
  "cancelled",
];

type InvalidationReasonMap = Readonly<
  Record<string, readonly InvalidationReason[]>
>;

export function PlanList({
  page,
  status,
  invalidationReasons = {},
}: Readonly<{
  page: PlanListPage;
  status: PlanStatusFilter;
  invalidationReasons?: InvalidationReasonMap;
}>) {
  const counts = countStatuses(page.items);

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="当前查询页计划指标"
      >
        <div aria-label="进行中计划数量">
          <MetricCard
            label="进行中"
            value={counts.active}
            detail="当前查询页真实返回"
            icon={Activity}
            tone="forest"
          />
        </div>
        <div aria-label="待确认计划数量">
          <MetricCard
            label="待确认"
            value={counts.awaiting_confirmation}
            detail="等待人工确认真实子代"
            icon={CircleAlert}
            tone="sky"
          />
        </div>
        <div aria-label="已完成计划数量">
          <MetricCard
            label="已完成"
            value={counts.completed}
            detail="当前查询页历史记录"
            icon={BadgeCheck}
            tone="leaf"
          />
        </div>
        <div aria-label="已暂停或已失效计划数量">
          <MetricCard
            label="已暂停或已失效"
            value={counts.paused + counts.invalidated}
            detail="需要恢复或处理失效"
            icon={PauseCircle}
            tone="sky"
          />
        </div>
      </section>

      <Tabs value={status} className="min-w-0 gap-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <nav
            className="min-w-0 max-w-full overflow-x-auto pb-1"
            aria-label="计划状态筛选"
          >
            <TabsList variant="line" className="w-max min-w-full justify-start">
              {filters.map(([value, label]) => (
                <TabsTrigger key={value} value={value} asChild>
                  <Link
                    href={value === "all" ? "/plans" : `/plans?status=${value}`}
                    aria-current={status === value ? "page" : undefined}
                    className="no-underline"
                  >
                    {label}
                  </Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                更多筛选
                <ChevronDown aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem asChild>
                <Link
                  href="/plans?status=cancelled"
                  aria-current={status === "cancelled" ? "page" : undefined}
                  className="w-full no-underline"
                >
                  已取消
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {filterContentValues.map((value) => (
          <TabsContent
            key={value}
            value={value}
            forceMount
            className="grid min-w-0 gap-6 data-[state=inactive]:hidden"
          >
            {status !== value ? null : (
              <>
                {page.items.length === 0 ? (
                  <Card className="border-dashed border-glass-border bg-white/78 shadow-soft">
                    <CardContent className="grid justify-items-start gap-3 p-6 sm:p-8">
                      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <Sparkles aria-hidden="true" className="size-6" />
                      </span>
                      <div>
                        <h2 className="text-xl font-bold text-foreground">
                          暂无执行计划
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          在配种结果页采用一条库存完整的确定性路线后，它会出现在这里。
                        </p>
                      </div>
                      <Button asChild>
                        <Link href="/breeder">打开配种器</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <section
                    className="grid min-w-0 gap-4 lg:grid-cols-2"
                    aria-label="计划列表"
                  >
                    {page.items.map((plan) => (
                      <PlanCard
                        key={plan.plan_id}
                        plan={plan}
                        invalidationReasons={
                          invalidationReasons[plan.plan_id] ?? []
                        }
                      />
                    ))}
                  </section>
                )}

                {page.next_cursor === null ? null : (
                  <Button
                    variant="outline"
                    asChild
                    className="justify-self-center"
                  >
                    <Link
                      href={`/plans?status=${status}&cursor=${encodeURIComponent(page.next_cursor)}&boundary=${encodeURIComponent(page.query_boundary)}`}
                    >
                      下一页
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function PlanCard({
  plan,
  invalidationReasons,
}: Readonly<{
  plan: PlanSummary;
  invalidationReasons: readonly InvalidationReason[];
}>) {
  const totalSteps = Math.max(0, plan.total_step_count);
  const progress =
    totalSteps === 0
      ? 0
      : Math.min(100, (plan.completed_step_count / totalSteps) * 100);
  const currentStep =
    totalSteps === 0
      ? "无执行步骤"
      : `${Math.min(plan.current_step_index + 1, totalSteps)} / ${totalSteps}`;

  return (
    <Card className="min-w-0 gap-0 overflow-hidden border-glass-border bg-card/92 py-0 shadow-soft transition-colors hover:border-primary/25">
      <CardContent className="grid min-w-0 gap-5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <PalPortrait
            palId={plan.target_pal_id}
            name={plan.target_pal_display_name}
            size={60}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={planStatusTone(plan.status)}>
                {planStatusLabels[plan.status]}
              </StatusChip>
              {plan.pending_candidate_count > 0 ? (
                <StatusChip tone="warning">
                  {plan.pending_candidate_count} 个候选
                </StatusChip>
              ) : null}
            </div>
            <h2 className="mt-2 break-words text-xl font-bold text-foreground">
              {plan.target_pal_display_name}
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {plan.target_pal_id}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            目标被动及 Rank
          </p>
          {plan.desired_passives.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">无指定被动</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.desired_passives.map((passive) => (
                <PassiveBadge
                  key={passive.passive_skill_id}
                  name={passive.display_name}
                  rank={passive.rank}
                  isNegative={passive.is_negative}
                  showRank
                  className="max-w-full"
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">计划进度</span>
            <strong className="tabular-nums text-foreground">
              {plan.completed_step_count} / {totalSteps} ·{" "}
              {Math.round(progress)}%
            </strong>
          </div>
          <Progress
            value={progress}
            aria-label={`${plan.target_pal_display_name}计划进度`}
          />
        </div>

        <dl className="grid min-w-0 gap-3 rounded-2xl bg-muted/55 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">当前步骤</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {currentStep}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">总步骤数</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {totalSteps}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">下一步操作</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {nextPlanActionLabel(plan.status)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3.5" />
              更新时间
            </dt>
            <dd className="mt-1 font-semibold text-foreground">
              {formatPlanDateTime(plan.updated_at)}
            </dd>
          </div>
        </dl>

        {plan.status === "invalidated" ? (
          <div
            className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"
            role="note"
          >
            <p className="font-semibold">失效原因</p>
            {invalidationReasons.length === 0 ? (
              <p className="mt-1">打开详情读取已物化的失效原因。</p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {invalidationReasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`}>
                    {invalidationReasonDescriptions[reason.code]}{" "}
                    <code className="text-xs">{reason.code}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <Button variant="outline" asChild className="w-full sm:w-fit">
          <Link href={`/plans/${plan.plan_id}`}>
            打开详情
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function countStatuses(
  plans: readonly PlanSummary[],
): Record<PlanStatus, number> {
  const counts: Record<PlanStatus, number> = {
    active: 0,
    awaiting_confirmation: 0,
    paused: 0,
    completed: 0,
    invalidated: 0,
    cancelled: 0,
  };
  for (const plan of plans) counts[plan.status] += 1;
  return counts;
}
