import { ClipboardList, GitBranch, Sprout } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/layout/page-hero";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/features/auth/server";
import { PlanError } from "@/features/plans/plan-error";
import { PlanList } from "@/features/plans/plan-list";
import {
  PlanDataError,
  loadPlanDetail,
  loadPlans,
  type PlanStatusFilter,
} from "@/features/plans/server";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set<PlanStatusFilter>([
  "all",
  "active",
  "awaiting_confirmation",
  "paused",
  "completed",
  "invalidated",
  "cancelled",
]);

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    cursor?: string;
    boundary?: string;
  }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null)
    return <PlanError code="PLAYER_BINDING_REQUIRED" />;
  const query = await searchParams;
  const status = allowedStatuses.has(query.status as PlanStatusFilter)
    ? (query.status as PlanStatusFilter)
    : "all";
  let page;
  try {
    page = await loadPlans({
      status,
      cursor: query.cursor,
      boundary: query.boundary,
    });
  } catch (error) {
    return (
      <PlanError
        code={error instanceof PlanDataError ? error.code : "DATA_UNAVAILABLE"}
      />
    );
  }
  const invalidationReasons = Object.fromEntries(
    await Promise.all(
      page.items
        .filter((plan) => plan.status === "invalidated")
        .map(async (plan) => {
          try {
            const detail = await loadPlanDetail(plan.plan_id);
            return [plan.plan_id, detail.invalidation_reasons] as const;
          } catch {
            return [plan.plan_id, []] as const;
          }
        }),
    ),
  );

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow="Execution plans"
        title="我的计划"
        description="追踪已采用的确定性配种路线，聚焦当前步骤，并由玩家人工确认新快照中的真实子代。"
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[30%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <Button asChild size="lg">
            <Link href="/breeder">
              <Sprout aria-hidden="true" className="size-4" />
              创建配种任务
            </Link>
          </Button>
        }
        visual={
          <div
            aria-hidden="true"
            className="hidden h-full items-center gap-3 lg:flex"
          >
            {[ClipboardList, GitBranch, Sprout].map((Icon, index) => (
              <span
                key={index}
                className="grid size-16 place-items-center rounded-2xl border border-white/80 bg-white/76 text-primary shadow-soft backdrop-blur-sm"
              >
                <Icon className="size-7" strokeWidth={1.8} />
              </span>
            ))}
          </div>
        }
      />
      <PlanList
        page={page}
        status={status}
        invalidationReasons={invalidationReasons}
      />
    </div>
  );
}
