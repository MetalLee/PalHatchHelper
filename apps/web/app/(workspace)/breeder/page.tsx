import { PageHero } from "@/components/layout/page-hero";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { requireUserContext } from "@/features/auth/server";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreederForm } from "@/features/breeder/breeder-form";
import { BreederFlowProgress } from "@/features/breeder/components/breeder-flow-progress";
import {
  BreederDataError,
  loadBreederFormContext,
} from "@/features/breeder/server";

export const dynamic = "force-dynamic";

export default async function BreederPage() {
  const user = await requireUserContext();
  if (user.binding === null)
    return <BreederError code="PLAYER_BINDING_REQUIRED" />;
  let context;
  try {
    context = await loadBreederFormContext();
  } catch (error) {
    return (
      <BreederError
        code={
          error instanceof BreederDataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  return (
    <div className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow="规划你的下一条路线"
        title="配种工作台"
        description="选择目标帕鲁和想要的被动技能，我们会根据你当前可用的帕鲁推荐合适路线。"
        className="min-h-[16rem] border-white/80 bg-white/74 sm:min-h-[17rem]"
        background={<ForestScenery variant="hero" />}
      />
      <BreederFlowProgress />
      <div className="min-w-0">
        <BreederForm context={context} />
      </div>
    </div>
  );
}
