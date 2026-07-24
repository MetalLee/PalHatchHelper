import { GitBranch, Sparkles, Target } from "lucide-react";

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
        eyebrow="Deterministic breeder"
        title="配种器"
        description="设置目标 Pal 与期望被动，创建固定库存、目录、算法和评分版本的确定性配种任务。"
        className="min-h-[16rem] border-white/80 bg-white/74 sm:min-h-[17rem] lg:pr-[30%]"
        background={<ForestScenery variant="hero" />}
        visual={
          <div
            aria-hidden="true"
            className="hidden h-full items-center gap-3 lg:flex"
          >
            {[Target, Sparkles, GitBranch].map((Icon, index) => (
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
      <BreederFlowProgress />
      <div className="min-w-0">
        <div className="mb-4">
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
            Step 1 · Target setup
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            创建配种任务
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            当前页只收集确定性搜索输入；方案推荐与配种路径会在任务页基于固定版本生成。
          </p>
        </div>
        <BreederForm context={context} />
      </div>
    </div>
  );
}
