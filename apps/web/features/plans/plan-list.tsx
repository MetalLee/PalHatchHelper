"use client";

import type { PlanListPage, PlanSummary } from "@palhatch/contracts";
import { ChevronRight, GitBranch, Sparkles } from "lucide-react";
import Link from "next/link";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { userFacingCatalogName } from "@/lib/user-facing-name";

export function PlanList({ page }: Readonly<{ page: PlanListPage }>) {
  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
      {page.items.length === 0 ? (
        <Card className="border-dashed border-glass-border bg-white/78 shadow-soft">
          <CardContent className="grid justify-items-start gap-3 p-6 sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                暂无收藏计划
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                在配种结果页保存一条路线后，它会出现在这里。
              </p>
            </div>
            <Button asChild>
              <Link href="/breeder">开始规划</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section
          className="grid min-w-0 justify-items-start gap-4 lg:grid-cols-2"
          aria-label="计划列表"
        >
          {page.items.map((plan) => (
            <PlanCard key={plan.route_id} plan={plan} />
          ))}
        </section>
      )}

      {page.next_cursor === null ? null : (
        <Button variant="outline" asChild className="justify-self-center">
          <Link
            href={`/plans?cursor=${encodeURIComponent(page.next_cursor)}&boundary=${encodeURIComponent(page.query_boundary)}`}
          >
            下一页
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function PlanCard({ plan }: Readonly<{ plan: PlanSummary }>) {
  const targetName = userFacingCatalogName(
    plan.target_pal_display_name,
    plan.target_pal_id,
    "名称暂不可用",
  );
  return (
    <Card
      data-plan-card
      className="w-full max-w-[32rem] min-w-0 gap-0 overflow-hidden border-glass-border bg-card/92 py-0 shadow-soft transition-colors hover:border-primary/25"
    >
      <CardContent className="grid min-w-0 content-start gap-5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <PalPortrait palId={plan.target_pal_id} name={targetName} size={60} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={plan.feasibility_status === "ready" ? "good" : "warning"}
              >
                {plan.feasibility_status === "ready"
                  ? "库存可执行"
                  : "还需准备帕鲁"}
              </StatusChip>
              <span className="text-xs text-muted-foreground">
                保存于 {formatDateTime(plan.saved_at)}
              </span>
            </div>
            <h2 className="mt-2 truncate text-lg font-bold text-foreground">
              {targetName}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <GitBranch aria-hidden="true" className="size-4" />
              {plan.generation_count} 代 · {plan.step_count} 步 · 借用{" "}
              {plan.borrowed_pal_count} 只
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            想要的被动
          </p>
          {plan.desired_passives.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">无指定被动</p>
          ) : (
            <div
              className="mt-2 grid auto-rows-min grid-cols-2 content-start items-start gap-1.5"
              data-passive-layout="2x2"
            >
              {plan.desired_passives.map((passive) => (
                <PassiveBadge
                  key={passive.passive_skill_id}
                  name={userFacingCatalogName(
                    passive.display_name,
                    passive.passive_skill_id,
                    "被动名称暂不可用",
                  )}
                  rank={passive.rank}
                  isNegative={passive.is_negative}
                  className="w-full min-w-0 justify-start truncate"
                />
              ))}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/55 p-4 text-sm sm:grid-cols-4">
          <Metric label="推荐分" value={plan.total_score.toFixed(2)} />
          <Metric
            label="尝试"
            value={`${plan.estimated_attempts_min}–${plan.estimated_attempts_max} 次`}
          />
          <Metric label="难度" value={difficultyLabel(plan.difficulty)} />
          <Metric label="还差" value={`${plan.missing_pal_count} 只`} />
        </dl>

        <Button asChild className="w-full">
          <Link href={`/plans/${plan.route_id}`}>
            查看计划
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function difficultyLabel(value: PlanSummary["difficulty"]): string {
  return { low: "低", medium: "中", high: "高" }[value];
}
