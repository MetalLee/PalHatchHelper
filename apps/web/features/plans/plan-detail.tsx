"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BookmarkCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BreedingRouteTree } from "@/features/breeder/components/breeding-route-tree";
import { PinnedVersionDetails } from "@/features/breeder/components/pinned-version-details";
import { RouteScoreBreakdown } from "@/features/breeder/components/route-score-breakdown";
import { RouteMissingRequirements } from "@/features/breeder/components/route-supporting-details";
import {
  localizedName,
  optimizationModeLabels,
} from "@/features/breeder/presentation";

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
      router.replace("/plans");
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

      <section
        className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
        aria-label="收藏计划摘要"
      >
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <PalPortrait palId={job.target_pal_id} name={targetName} size={64} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
              <Target aria-hidden="true" className="size-4" />
              保存的配种路线
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {targetName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              保存于 {formatDateTime(reference.saved_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip
              tone={route.feasibility_status === "ready" ? "good" : "warning"}
            >
              {route.feasibility_status === "ready"
                ? "库存可执行"
                : "还需准备帕鲁"}
            </StatusChip>
            <StatusChip tone="neutral">
              <BookmarkCheck aria-hidden="true" className="size-3.5" />
              已收藏
            </StatusChip>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Sparkles aria-hidden="true" className="size-4 text-primary" />
            想要的被动
          </h2>
          {job.desired_passive_ids.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">未指定被动</p>
          ) : (
            <div
              className="mt-2 grid auto-rows-min grid-cols-2 content-start items-start gap-2 sm:max-w-lg"
              data-passive-layout="2x2"
            >
              {job.desired_passive_ids.map((passiveId) => (
                <PassiveBadge
                  key={passiveId}
                  name={localizedName(passiveNames, passiveId, "被动")}
                  rank={passiveFacts.get(passiveId)?.rank ?? null}
                  isNegative={passiveFacts.get(passiveId)?.isNegative ?? null}
                  className="w-full min-w-0 justify-start truncate"
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <StatusChip tone="good">
            {optimizationModeLabels[job.optimization_mode]}
          </StatusChip>
          <StatusChip tone="neutral">最多 {job.max_generations} 代</StatusChip>
          <StatusChip tone={job.allow_guild_shared ? "good" : "neutral"}>
            {job.allow_guild_shared ? "可使用公会库存" : "仅使用自己的库存"}
          </StatusChip>
        </div>
      </section>

      {errorCode === null ? null : (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>移除收藏失败</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {errorCode}
          </AlertDescription>
        </Alert>
      )}

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
        compactPreview
        eyebrow={null}
        title="配种路径"
        description={null}
      />
      <RouteScoreBreakdown route={route} />
      <PinnedVersionDetails
        inventorySnapshotId={job.inventory_snapshot_id}
        gameDataVersionId={job.game_data_version_id}
        gameDataContentHash={job.game_data_content_hash}
        algorithmVersion={job.algorithm_version}
        scoringProfileVersion={job.scoring_profile_version}
        optimizationMode={job.optimization_mode}
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-glass-border bg-white/76 p-4 shadow-soft sm:p-5">
        <div>
          <h2 className="font-bold text-foreground">管理收藏</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            移除后，这条路线将不再出现在“我的计划”中，原配种结果仍会保留。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/breeder/jobs/${reference.source_job_id}`}>
              查看原配种结果
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
