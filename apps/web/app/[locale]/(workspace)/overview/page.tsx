import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import {
  OverviewDashboard,
  type OverviewPlanFeed,
} from "@/features/overview/overview-dashboard";
import {
  getInventoryDataStatus,
  Phase5DataError,
} from "@/features/pals/server";
import { loadPlans } from "@/features/plans/server";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const catalogLocale = catalogLocaleFor(locale);
  const context = await requireUserContext();
  if (context.binding === null) return <PlayerBindingSetup />;

  const [dataStatusResult, plansResult] = await Promise.allSettled([
    getInventoryDataStatus(),
    loadPlans({ limit: 4 }, undefined, catalogLocale),
  ]);
  if (dataStatusResult.status === "rejected") {
    const error = dataStatusResult.reason;
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
      dataStatus={dataStatusResult.value}
      planFeed={planFeed}
    />
  );
}
