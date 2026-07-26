import { Bookmark, GitBranch, Sprout } from "lucide-react";
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
        eyebrow="Saved breeding routes"
        title="我的计划"
        description="收藏配种结果中的确定性路线，随时查看完整配种树、库存需求、评分与固定版本。"
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
            {[Bookmark, GitBranch, Sprout].map((Icon, index) => (
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
      <PlanList page={page} />
    </div>
  );
}
