import { requireUserContext } from "@/features/auth/server";
import { PlanDetail } from "@/features/plans/plan-detail";
import { PlanError } from "@/features/plans/plan-error";
import { PlanDataError, loadPlanDetail } from "@/features/plans/server";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; planId: string }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null)
    return <PlanError code="PLAYER_BINDING_REQUIRED" />;
  const { locale: localeParam, planId } = await params;
  const locale = requireAppLocale(localeParam);
  if (!/^[0-9a-f-]{36}$/i.test(planId))
    return <PlanError code="PLAN_NOT_FOUND" />;
  let detail;
  try {
    detail = await loadPlanDetail(planId, undefined, catalogLocaleFor(locale));
  } catch (error) {
    return (
      <PlanError
        code={error instanceof PlanDataError ? error.code : "DATA_UNAVAILABLE"}
      />
    );
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-clip">
      <PlanDetail detail={detail} />
    </div>
  );
}
