"use client";

import { AlertTriangle, ArrowLeft, BookmarkCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHero } from "@/components/layout/page-hero";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { StatusChip } from "@/components/status/status-chip";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BreedingJobTargetSummary } from "@/features/breeder/components/breeding-job-target-summary";
import { BreedingRouteTree } from "@/features/breeder/components/breeding-route-tree";
import { PinnedVersionDetails } from "@/features/breeder/components/pinned-version-details";
import { RouteScoreBreakdown } from "@/features/breeder/components/route-score-breakdown";
import { RouteMissingRequirements } from "@/features/breeder/components/route-supporting-details";
import { localizedName } from "@/features/breeder/presentation";

import type { SavedPlanDetail } from "./server";

export function PlanDetail({ detail }: Readonly<{ detail: SavedPlanDetail }>) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const { job, reference, route } = detail;
  const palNames = useMemo(
    () =>
      new Map(
        job.localization.pals.map((pal) => [pal.pal_id, pal.display_name]),
      ),
    [job.localization.pals],
  );
  const passiveNames = useMemo(
    () =>
      new Map(
        job.localization.passive_skills.map((passive) => [
          passive.passive_skill_id,
          passive.display_name,
        ]),
      ),
    [job.localization.passive_skills],
  );
  const passiveFacts = useMemo(
    () =>
      new Map(
        job.localization.passive_skills.map((passive) => [
          passive.passive_skill_id,
          { rank: passive.rank, isNegative: passive.is_negative },
        ]),
      ),
    [job.localization.passive_skills],
  );
  const targetName = localizedName(palNames, job.target_pal_id, "帕鲁");

  async function removePlan(): Promise<void> {
    setRemoving(true);
    setErrorCode(null);
    try {
      const response = await fetch(`/api/plans/${reference.route_id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error_code" in payload &&
          typeof payload.error_code === "string"
            ? payload.error_code
            : "DATA_UNAVAILABLE";
        throw new Error(code);
      }
      router.push("/plans");
      router.refresh();
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "DATA_UNAVAILABLE");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8"
      aria-busy={removing}
    >
      <Button
        variant="ghost"
        asChild
        className="w-fit justify-start px-2 text-primary"
      >
        <Link href="/plans">
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回我的计划
        </Link>
      </Button>

      <PageHero
        eyebrow="Saved breeding route"
        title={targetName}
        description={`保存于 ${formatDateTime(reference.saved_at)}。这里保留任务生成时的完整确定性路线，不维护执行进度。`}
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[28%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <>
            <StatusChip
              tone={route.feasibility_status === "ready" ? "good" : "warning"}
            >
              {route.feasibility_status === "ready" ? "库存可执行" : "需补库存"}
            </StatusChip>
            <StatusChip tone="neutral">
              <BookmarkCheck aria-hidden="true" className="size-3.5" />
              已收藏
            </StatusChip>
          </>
        }
        visual={
          <div
            aria-hidden="true"
            className="hidden h-full items-center lg:flex"
          >
            <span className="rounded-[2rem] border border-white/80 bg-white/78 p-5 shadow-soft backdrop-blur-sm">
              <PalPortrait
                palId={job.target_pal_id}
                name={targetName}
                size={104}
                className="rounded-3xl"
              />
            </span>
          </div>
        }
      />

      {errorCode === null ? null : (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>移除收藏失败</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {errorCode}
          </AlertDescription>
        </Alert>
      )}

      <BreedingJobTargetSummary
        jobId={job.job_id}
        targetPalId={job.target_pal_id}
        targetName={targetName}
        desiredPassiveIds={job.desired_passive_ids}
        passiveNames={passiveNames}
        passiveFacts={passiveFacts}
        optimizationMode={job.optimization_mode}
        allowGuildShared={job.allow_guild_shared}
        maxGenerations={job.max_generations}
      />

      <RouteMissingRequirements
        route={route}
        palNames={palNames}
        passiveNames={passiveNames}
      />
      <BreedingRouteTree
        route={route}
        targetPalId={job.target_pal_id}
        palNames={palNames}
        passiveNames={passiveNames}
        passiveFacts={passiveFacts}
        ariaLabel="收藏路线的完整配种路径树"
        eyebrow="Saved route tree"
        title="收藏路线"
        description="初始库存亲本 → 中间子代 → 最终目标；内容来自原任务的固定版本。"
      />
      <RouteScoreBreakdown route={route} />
      <PinnedVersionDetails
        inventorySnapshotId={job.inventory_snapshot_id}
        gameDataVersionId={job.game_data_version_id}
        gameDataContentHash={job.game_data_content_hash}
        algorithmVersion={job.algorithm_version}
        scoringProfileVersion={job.scoring_profile_version}
        optimizationMode={job.optimization_mode}
        title="路线固定版本"
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-glass-border bg-white/76 p-4 shadow-soft sm:p-5">
        <div>
          <h2 className="font-bold text-foreground">管理收藏</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            移除只会删除“我的计划”收藏，不会删除原配种任务。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/breeder/jobs/${reference.source_job_id}`}>
              返回原任务
            </Link>
          </Button>
          <Button
            variant="destructive"
            disabled={removing}
            onClick={() => void removePlan()}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {removing ? "正在移除…" : "移除收藏"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
