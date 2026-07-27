import { Sprout } from "lucide-react";
import Link from "next/link";

import { PageHero } from "@/components/layout/page-hero";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/features/auth/server";
import { PlanError } from "@/features/plans/plan-error";
import { PlanList } from "@/features/plans/plan-list";
import { PlanDataError, loadPlans } from "@/features/plans/server";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; boundary?: string }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null)
    return <PlanError code="PLAYER_BINDING_REQUIRED" />;
  const query = await searchParams;
  let page;
  try {
    page = await loadPlans({ cursor: query.cursor, boundary: query.boundary });
  } catch (error) {
    return (
      <PlanError
        code={error instanceof PlanDataError ? error.code : "DATA_UNAVAILABLE"}
      />
    );
  }

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow="保存的配种路线"
        title="我的计划"
        description="把喜欢的配种路线留在这里，随时回来查看目标、被动技能和完整配种步骤。"
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem]"
        background={<ForestScenery variant="hero" />}
        actions={
          <Button asChild size="lg">
            <Link href="/breeder">
              <Sprout aria-hidden="true" className="size-4" />
              开始规划
            </Link>
          </Button>
        }
      />
      <PlanList page={page} />
    </div>
  );
}
