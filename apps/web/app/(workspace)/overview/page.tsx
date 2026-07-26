import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import {
  OverviewDashboard,
  type OverviewPlanFeed,
} from "@/features/overview/overview-dashboard";
import { getOverviewSummary, Phase5DataError } from "@/features/pals/server";
import { loadPlans } from "@/features/plans/server";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const context = await requireUserContext();
  if (context.binding === null)
    return <ErrorState code="PLAYER_BINDING_REQUIRED" />;

  const [summaryResult, plansResult] = await Promise.allSettled([
    getOverviewSummary(),
    loadPlans({ limit: 4 }),
  ]);
  if (summaryResult.status === "rejected") {
    const error = summaryResult.reason;
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  const planFeed: OverviewPlanFeed = {
    items: plansResult.status === "fulfilled" ? plansResult.value.items : [],
    unavailable: plansResult.status === "rejected",
  };
  return (
    <OverviewDashboard
      playerNickname={context.binding.player_nickname}
      worldName={context.binding.world_name}
      guildName={context.binding.guild_name}
      summary={summaryResult.value}
      planFeed={planFeed}
    />
  );
}
