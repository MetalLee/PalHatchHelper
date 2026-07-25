"use client";

import type { PlanDetail as PlanDetailData } from "@palhatch/contracts";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  History,
  Pause,
  Play,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHero } from "@/components/layout/page-hero";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BreedingRouteTree } from "@/features/breeder/components/breeding-route-tree";
import { PinnedVersionDetails } from "@/features/breeder/components/pinned-version-details";
import { BreedingTreeBuildError } from "@/features/breeder/lib/build-breeding-tree";

import { buildPlanBreedingTree } from "./build-plan-breeding-tree";
import { CurrentStepPanel } from "./current-step-panel";
import type { PlanActionPayload } from "./plan-action-types";
import { PlanStepList } from "./plan-step-list";
import {
  buildPlanStepOverlays,
  formatPlanDateTime,
  invalidationReasonDescriptions,
  planStatusLabels,
  planStatusTone,
  safeInstanceSummary,
} from "./presentation";

export function PlanDetail({ detail }: Readonly<{ detail: PlanDetailData }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const currentStep = detail.steps.find(
    (step) => step.step_index === detail.summary.current_step_index,
  );
  const currentCandidates =
    currentStep === undefined
      ? []
      : detail.candidates.filter(
          (candidate) => candidate.step_id === currentStep.step_id,
        );
  const progress =
    detail.summary.total_step_count === 0
      ? 0
      : Math.min(
          100,
          (detail.summary.completed_step_count /
            detail.summary.total_step_count) *
            100,
        );
  const palNames = buildPalNames(detail);
  const passiveNames = new Map(
    detail.summary.desired_passive_ids.map((passiveId, index) => [
      passiveId,
      detail.summary.desired_passive_display_names[index] ?? passiveId,
    ]),
  );
  const stepOverlays = buildPlanStepOverlays(detail);
  let treeModel;
  let treeError: string | null = null;
  try {
    treeModel = buildPlanBreedingTree(detail);
  } catch (error) {
    treeError =
      error instanceof BreedingTreeBuildError
        ? error.code
        : "INVALID_BREEDING_TREE";
  }

  async function act(payload: PlanActionPayload): Promise<void> {
    setBusy(true);
    setErrorCode(null);
    try {
      const response = await fetch(
        `/api/plans/${detail.summary.plan_id}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            ...payload,
            expected_concurrency_version: detail.summary.concurrency_version,
            idempotency_key: `web:${crypto.randomUUID()}`,
          }),
        },
      );
      const result = (await response.json()) as {
        error_code?: string;
        job_id?: string;
      };
      if (!response.ok)
        throw new Error(result.error_code ?? "DATA_UNAVAILABLE");
      if (payload.action === "recalculate" && result.job_id) {
        router.push(`/breeder/jobs/${result.job_id}`);
        return;
      }
      router.refresh();
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "DATA_UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8"
      aria-busy={busy}
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
        eyebrow={`Execution plan · ${planStatusLabels[detail.summary.status]}`}
        title={detail.summary.target_pal_display_name}
        description={`固定路线 ${safeInstanceSummary(detail.adopted_route_id)}。按真实步骤人工推进，候选子代只在确认后进入计划。`}
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem] lg:pr-[28%]"
        background={<ForestScenery variant="hero" />}
        actions={
          <>
            <StatusChip tone={planStatusTone(detail.summary.status)}>
              {planStatusLabels[detail.summary.status]}
            </StatusChip>
            <StatusChip
              tone={detail.invalidation_reasons.length ? "danger" : "good"}
            >
              {detail.invalidation_reasons.length
                ? "计划已失效"
                : "固定版本可追溯"}
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
                palId={detail.summary.target_pal_id}
                name={detail.summary.target_pal_display_name}
                size={104}
                className="rounded-3xl"
              />
            </span>
          </div>
        }
      />

      <Card className="min-w-0 border-glass-border bg-card/92 py-0 shadow-soft">
        <CardContent className="grid min-w-0 gap-5 p-5 sm:p-6">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
                Plan focus
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">
                目标摘要与计划进度
              </h2>
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {detail.summary.plan_id}
              </p>
            </div>
            <PlanTopActions
              status={detail.summary.status}
              busy={busy}
              act={act}
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              目标被动及 Rank
            </p>
            {detail.summary.desired_passive_display_names.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">无指定被动</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.summary.desired_passive_display_names.map(
                  (name, index) => (
                    <PassiveBadge
                      key={detail.summary.desired_passive_ids[index] ?? name}
                      name={name}
                      rank={null}
                      showRank
                      className="max-w-full"
                    />
                  ),
                )}
              </div>
            )}
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
            <div className="grid gap-2 rounded-2xl bg-muted/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">计划进度</span>
                <strong className="tabular-nums text-foreground">
                  {detail.summary.completed_step_count} /{" "}
                  {detail.summary.total_step_count} · {Math.round(progress)}%
                </strong>
              </div>
              <Progress value={progress} aria-label="计划进度" />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/55 p-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">当前步骤</dt>
                <dd className="mt-1 font-bold tabular-nums text-foreground">
                  {Math.min(
                    detail.summary.current_step_index + 1,
                    detail.summary.total_step_count,
                  )}{" "}
                  / {detail.summary.total_step_count}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">并发版本</dt>
                <dd className="mt-1 font-bold tabular-nums text-foreground">
                  v{detail.summary.concurrency_version}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">创建时间</dt>
                <dd className="mt-1 text-foreground">
                  {formatPlanDateTime(detail.summary.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">更新时间</dt>
                <dd className="mt-1 text-foreground">
                  {formatPlanDateTime(detail.summary.updated_at)}
                </dd>
              </div>
            </dl>
          </div>

          {detail.invalidation_reasons.length > 0 ? (
            <section
              className="rounded-3xl border border-orange-300 bg-orange-50 p-4 text-orange-950 sm:p-5"
              role="alert"
              aria-labelledby="plan-invalidation-heading"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3
                    id="plan-invalidation-heading"
                    className="font-bold text-orange-950"
                  >
                    计划失效原因
                  </h3>
                  <ul className="mt-3 grid gap-3">
                    {detail.invalidation_reasons.map((reason, index) => (
                      <li
                        key={`${reason.code}-${index}`}
                        className="rounded-2xl bg-white/70 p-3"
                      >
                        <code className="text-xs font-bold">{reason.code}</code>
                        <p className="mt-1 text-sm leading-6">
                          {invalidationReasonDescriptions[reason.code]}
                        </p>
                        <p className="mt-1 text-xs text-orange-900">
                          {reason.step_index === null
                            ? "影响整个计划"
                            : `影响步骤 ${reason.step_index + 1}`}
                          {reason.instance_uid === null
                            ? ""
                            : ` · 实例 ${safeInstanceSummary(
                                reason.instance_uid,
                              )}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>

      {errorCode === null ? null : (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>计划操作未完成</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {errorCode}
          </AlertDescription>
        </Alert>
      )}
      {busy ? (
        <p
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950"
          role="status"
          aria-live="polite"
        >
          正在提交计划动作，请稍候…
        </p>
      ) : null}

      <PinnedVersionDetails
        inventorySnapshotId={detail.summary.version_pin.inventory_snapshot_id}
        gameDataVersionId={detail.summary.version_pin.game_data_version_id}
        gameDataContentHash={detail.summary.version_pin.content_hash}
        algorithmVersion={detail.summary.version_pin.algorithm_version}
        scoringProfileVersion={
          detail.summary.version_pin.scoring_profile_version
        }
        title="计划固定版本"
      />

      {treeModel === undefined ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>计划树数据不一致</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {treeError}
          </AlertDescription>
        </Alert>
      ) : (
        <BreedingRouteTree
          treeModel={treeModel}
          targetPalId={detail.summary.target_pal_id}
          palNames={palNames}
          passiveNames={passiveNames}
          stepOverlays={stepOverlays}
          ariaLabel="完整配种路径树"
          eyebrow="Execution route tree"
          title="完整配种路径"
          description="初始库存亲本 → 中间子代 → 最终目标；节点颜色表示完成、当前、待开始、候选与失效状态。"
          summary={`${detail.steps.length} 个步骤 · 当前第 ${
            Math.min(
              detail.summary.current_step_index + 1,
              detail.summary.total_step_count,
            ) || 0
          } 步`}
        />
      )}

      {currentStep === undefined ? (
        <Card className="border-dashed border-glass-border bg-white/78">
          <CardContent className="p-6">
            <h2 className="font-bold text-foreground">当前没有执行步骤</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              该历史计划未物化可执行步骤，界面不会生成虚构节点。
            </p>
          </CardContent>
        </Card>
      ) : (
        <CurrentStepPanel
          step={currentStep}
          planStatus={detail.summary.status}
          planConcurrencyVersion={detail.summary.concurrency_version}
          candidates={currentCandidates}
          palNames={palNames}
          passiveNames={passiveNames}
          busy={busy}
          act={act}
        />
      )}

      <PlanStepList
        steps={detail.steps}
        currentStepIndex={detail.summary.current_step_index}
        palNames={palNames}
        passiveNames={passiveNames}
      />

      <AuditTimeline detail={detail} />
    </div>
  );
}

function PlanTopActions({
  status,
  busy,
  act,
}: Readonly<{
  status: PlanDetailData["summary"]["status"];
  busy: boolean;
  act: (payload: PlanActionPayload) => Promise<void>;
}>) {
  if (status === "paused") {
    return (
      <Button
        type="button"
        disabled={busy}
        onClick={() => void act({ action: "resume" })}
      >
        <Play aria-hidden="true" className="size-4" />
        恢复计划
      </Button>
    );
  }
  if (status === "active" || status === "awaiting_confirmation") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void act({ action: "pause" })}
      >
        <Pause aria-hidden="true" className="size-4" />
        暂停计划
      </Button>
    );
  }
  if (status === "invalidated") {
    return (
      <Button
        type="button"
        disabled={busy}
        onClick={() =>
          void act({ action: "recalculate", reason: "plan invalidated" })
        }
      >
        <RefreshCcw aria-hidden="true" className="size-4" />
        基于最新库存重新计算
      </Button>
    );
  }
  return (
    <Button variant="outline" asChild>
      <Link href="/plans">
        <History aria-hidden="true" className="size-4" />
        查看历史计划
      </Link>
    </Button>
  );
}

function AuditTimeline({ detail }: Readonly<{ detail: PlanDetailData }>) {
  return (
    <Card className="min-w-0 border-glass-border bg-card/90 py-0 shadow-soft">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <History aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Immutable history
            </p>
            <h2 className="mt-1 text-xl font-bold text-foreground">
              审计时间线
            </h2>
          </div>
        </div>
        {detail.events.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-muted/55 p-4 text-sm text-muted-foreground">
            暂无已物化事件。
          </p>
        ) : (
          <ol className="mt-5 grid gap-4">
            {detail.events.map((event) => (
              <li
                className="relative min-w-0 border-l-2 border-primary/20 pl-5"
                key={event.event_id}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-1 -left-[0.44rem] size-3 rounded-full border-2 border-white bg-primary"
                />
                <p className="break-all text-sm font-bold text-foreground">
                  {event.event_type}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {event.actor_display_name} ·{" "}
                  {formatPlanDateTime(event.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function buildPalNames(detail: PlanDetailData): ReadonlyMap<string, string> {
  const names = new Map<string, string>([
    [detail.summary.target_pal_id, detail.summary.target_pal_display_name],
  ]);
  for (const candidate of detail.candidates) {
    names.set(candidate.pal_id, candidate.pal_display_name);
  }
  return names;
}
