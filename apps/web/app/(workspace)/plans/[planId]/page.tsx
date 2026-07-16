import { requireUserContext } from "@/features/auth/server";
import { PlanDetail } from "@/features/plans/plan-detail";
import { PlanError } from "@/features/plans/plan-error";
import { PlanDataError, loadPlanDetail } from "@/features/plans/server";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null)
    return <PlanError code="PLAYER_BINDING_REQUIRED" />;
  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(planId))
    return <PlanError code="PLAN_NOT_FOUND" />;
  let detail;
  try {
    detail = await loadPlanDetail(planId);
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
        <div className="min-w-0">
          <p className="eyebrow">PLAN HISTORY</p>
          <h1>执行计划详情</h1>
          <p className="break-all">{planId}</p>
        </div>
      </header>
      <PlanDetail detail={detail} />
    </div>
  );
}
