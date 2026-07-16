import { requireUserContext } from "@/features/auth/server";
import { PlanError } from "@/features/plans/plan-error";
import { PlanList } from "@/features/plans/plan-list";
import {
  PlanDataError,
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
  return (
    <div className="page-stack min-w-0">
      <header className="page-header">
        <div>
          <p className="eyebrow">EXECUTION PLANS</p>
          <h1>执行计划</h1>
          <p>人工推进固定版本路线，并确认新快照中检测到的真实子代。</p>
        </div>
      </header>
      <PlanList page={page} status={status} />
    </div>
  );
}
