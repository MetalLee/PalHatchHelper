"use client";

import type {
  OffspringCandidate,
  PlanDetail as PlanDetailData,
  PlanStep,
} from "@palhatch/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

const statusLabels: Record<string, string> = {
  active: "进行中",
  awaiting_confirmation: "待确认",
  paused: "已暂停",
  completed: "已完成",
  invalidated: "已失效",
  cancelled: "已取消",
  not_started: "未开始",
  breeding: "配种中",
  candidate_detected: "发现候选",
  retrying: "继续尝试",
  skipped: "已跳过",
};

type ActionPayload = Record<string, boolean | number | string> & {
  action: string;
};

export function PlanDetail({ detail }: Readonly<{ detail: PlanDetailData }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [existingUid, setExistingUid] = useState("");
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [reason, setReason] = useState("");
  const currentStep = detail.steps.find(
    (step) => step.step_index === detail.summary.current_step_index,
  );

  async function act(payload: ActionPayload): Promise<void> {
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
    <div className="grid min-w-0 gap-5">
      <section className="content-panel min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{statusLabels[detail.summary.status]}</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {detail.summary.target_pal_display_name}
            </h2>
            <p className="mt-1 break-all text-xs text-slate-500">
              {detail.summary.target_pal_id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.summary.status === "paused" ? (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void act({ action: "resume" })}
              >
                恢复计划
              </button>
            ) : detail.summary.status === "active" ||
              detail.summary.status === "awaiting_confirmation" ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void act({ action: "pause" })}
              >
                暂停计划
              </button>
            ) : null}
          </div>
        </div>
        <p className="notice-banner mt-5" role="note">
          系统只检测候选，必须由玩家确认；不会自动修改游戏或存档。
        </p>
        <dl className="fixed-inputs mt-5">
          <div>
            <dt>库存快照</dt>
            <dd>{detail.summary.version_pin.inventory_snapshot_id}</dd>
          </div>
          <div>
            <dt>目录版本</dt>
            <dd>{detail.summary.version_pin.game_data_version_id}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd>{detail.summary.version_pin.content_hash}</dd>
          </div>
          <div>
            <dt>算法 / 评分</dt>
            <dd>
              {detail.summary.version_pin.algorithm_version} /{" "}
              {detail.summary.version_pin.scoring_profile_version}
            </dd>
          </div>
        </dl>
      </section>

      {errorCode === null ? null : (
        <p className="notice-banner" role="alert">
          {errorCode}
        </p>
      )}

      <section className="grid gap-3" aria-label="执行步骤">
        {detail.steps.map((step) => (
          <StepPanel
            key={step.step_id}
            step={step}
            current={step.step_id === currentStep?.step_id}
            candidates={detail.candidates.filter(
              (candidate) => candidate.step_id === step.step_id,
            )}
            busy={busy}
            act={act}
          />
        ))}
      </section>

      {currentStep === undefined ||
      detail.summary.status === "completed" ||
      detail.summary.status === "invalidated" ? null : (
        <section className="content-panel grid gap-4" aria-label="当前步骤操作">
          <h2 className="text-lg font-semibold text-white">当前步骤操作</h2>
          <div className="flex flex-wrap gap-2">
            {currentStep.status === "not_started" ? (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void act({ action: "start", step_id: currentStep.step_id })
                }
              >
                标记为配种中
              </button>
            ) : null}
            {["breeding", "candidate_detected", "retrying"].includes(
              currentStep.status,
            ) ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void act({ action: "continue", step_id: currentStep.step_id })
                }
              >
                继续尝试
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="filter-field">
              <span>使用最新安全库存中的已有 Pal UID</span>
              <input
                value={existingUid}
                onChange={(event) => setExistingUid(event.target.value)}
                placeholder="输入实例 UID"
              />
            </label>
            <button
              className="secondary-button self-end"
              disabled={busy || existingUid.trim() === ""}
              onClick={() =>
                void act({
                  action: "select_existing",
                  step_id: currentStep.step_id,
                  pal_instance_uid: existingUid.trim(),
                  allow_passive_mismatch: allowMismatch,
                })
              }
            >
              选择已有 Pal
            </button>
          </div>
          <label className="share-choice">
            <input
              type="checkbox"
              checked={allowMismatch}
              onChange={(event) => setAllowMismatch(event.target.checked)}
            />
            明确接受被动不完全匹配
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="filter-field">
              <span>跳过原因</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="必填并写入审计"
              />
            </label>
            <button
              className="secondary-button self-end"
              disabled={busy || reason.trim() === ""}
              onClick={() =>
                void act({
                  action: "skip",
                  step_id: currentStep.step_id,
                  reason: reason.trim(),
                })
              }
            >
              跳过步骤
            </button>
          </div>
        </section>
      )}

      {detail.invalidation_reasons.length === 0 ? null : (
        <section className="state-card border-amber-300/20" role="alert">
          <h2 className="text-xl font-semibold text-white">计划需要重新计算</h2>
          <ul className="mt-3 grid gap-2 text-sm text-amber-100">
            {detail.invalidation_reasons.map((item, index) => (
              <li key={`${item.code}-${index}`}>{item.code}</li>
            ))}
          </ul>
          <button
            className="primary-button mt-5"
            disabled={busy}
            onClick={() =>
              void act({ action: "recalculate", reason: "plan invalidated" })
            }
          >
            基于最新库存重新计算
          </button>
        </section>
      )}

      <section className="content-panel">
        <h2 className="text-lg font-semibold text-white">审计时间线</h2>
        <ol className="mt-4 grid gap-4">
          {detail.events.map((event) => (
            <li
              className="border-l border-teal-200/20 pl-4"
              key={event.event_id}
            >
              <p className="text-sm font-medium text-white">
                {event.event_type}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {event.actor_display_name} ·{" "}
                {new Date(event.created_at).toLocaleString("zh-CN")}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function StepPanel({
  step,
  current,
  candidates,
  busy,
  act,
}: Readonly<{
  step: PlanStep;
  current: boolean;
  candidates: OffspringCandidate[];
  busy: boolean;
  act: (payload: ActionPayload) => Promise<void>;
}>) {
  return (
    <details className="content-panel min-w-0" open={current}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">步骤 {step.step_index + 1}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {step.expected_child_pal_id}
            </h2>
          </div>
          <span className="passive-chip">{statusLabels[step.status]}</span>
        </div>
      </summary>
      <div className="mt-5 grid gap-3 text-sm text-slate-300">
        <p>期望被动：{step.required_passive_ids.join("、") || "无"}</p>
        <p>期望性别：{step.preferred_gender ?? "不限"}</p>
        <p>尝试窗口：{step.attempt_number}</p>
        {step.selected_child_instance_uid ? (
          <p className="break-all text-teal-100">
            已选真实实例：{step.selected_child_instance_uid}
          </p>
        ) : null}
      </div>
      {candidates.length === 0 ? null : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.candidate_key}
              candidate={candidate}
              busy={busy}
              act={act}
            />
          ))}
        </div>
      )}
    </details>
  );
}

function CandidateCard({
  candidate,
  busy,
  act,
}: Readonly<{
  candidate: OffspringCandidate;
  busy: boolean;
  act: (payload: ActionPayload) => Promise<void>;
}>) {
  const unavailable = candidate.confirmed || candidate.rejected_at !== null;
  return (
    <article className="parent-card min-w-0" data-testid="offspring-candidate">
      <p className="eyebrow">匹配 {Math.round(candidate.match_score * 100)}%</p>
      <h3 className="mt-2 text-lg font-semibold text-white">
        {candidate.pal_display_name}
      </h3>
      <p className="mt-1 break-all text-xs text-slate-500">
        {candidate.pal_instance_uid}
      </p>
      <dl className="mt-4 grid gap-2 text-sm text-slate-300">
        <div>性别：{candidate.gender}</div>
        <div>等级：{candidate.level ?? "未知"}</div>
        <div>所有者：{candidate.owner_display_name}</div>
        <div>位置：{candidate.location_name ?? candidate.location_type}</div>
        <div>匹配被动：{candidate.matched_passive_ids.join("、") || "无"}</div>
        <div>
          首次检测：
          {new Date(candidate.first_detected_at).toLocaleString("zh-CN")}
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
        {Object.entries(candidate.match_breakdown).map(([key, value]) => (
          <span key={key}>
            {key}: {Math.round(value * 100)}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="primary-button"
          disabled={busy || unavailable}
          onClick={() =>
            void act({
              action: "confirm",
              step_id: candidate.step_id,
              candidate_key: candidate.candidate_key,
            })
          }
        >
          {candidate.confirmed ? "已确认" : "确认真实子代"}
        </button>
        <button
          className="secondary-button"
          disabled={busy || unavailable}
          onClick={() =>
            void act({
              action: "reject",
              candidate_key: candidate.candidate_key,
              reason: "玩家确认不是本次配种结果",
            })
          }
        >
          {candidate.rejected_at ? "已拒绝" : "拒绝"}
        </button>
      </div>
    </article>
  );
}
