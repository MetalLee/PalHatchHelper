"use client";

import type {
  AdoptRouteResponse,
  BreedingJobDetailRpcResult,
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
  BreedingRouteViewParent,
  RouteScoreComponent,
} from "@palhatch/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const terminal = new Set(["completed", "failed", "cancelled"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePolledJob(value: unknown): BreedingJobDetailRpcResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    throw new Error("DATA_UNAVAILABLE");
  }
  if (value.ok === false) {
    if (!("error_code" in value) || typeof value.error_code !== "string") {
      throw new Error("DATA_UNAVAILABLE");
    }
    return value as BreedingJobDetailRpcResult;
  }
  if (
    value.ok !== true ||
    !("data" in value) ||
    typeof value.data !== "object" ||
    value.data === null ||
    !("job_id" in value.data) ||
    typeof value.data.job_id !== "string" ||
    !uuidPattern.test(value.data.job_id)
  ) {
    throw new Error("DATA_UNAVAILABLE");
  }
  return value as BreedingJobDetailRpcResult;
}

function parseAdoption(value: unknown): AdoptRouteResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("plan_id" in value) ||
    typeof value.plan_id !== "string" ||
    !uuidPattern.test(value.plan_id) ||
    !("reused" in value) ||
    typeof value.reused !== "boolean" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !("concurrency_version" in value) ||
    !Number.isInteger(value.concurrency_version) ||
    Number(value.concurrency_version) < 1
  ) {
    throw new Error("ROUTE_NOT_ADOPTABLE");
  }
  return value as AdoptRouteResponse;
}

const stageLabels: Record<string, string> = {
  pending: "等待 Worker 领取",
  processing: "正在运行确定性算法",
  algorithm_completed: "算法已完成，正在准备解释",
  ai_enriching: "正在生成辅助解释",
  retry_pending: "Worker 将安全重试",
  completed: "任务完成",
  failed: "任务失败",
  cancelled: "任务已取消",
};

const optimizationModeLabels: Record<
  BreedingRoute["optimization_mode"],
  string
> = {
  balanced: "综合推荐",
  fastest: "最快路线",
  highest_success: "最高成功率",
  least_borrowing: "最少借用",
};

const scoreComponentLabels: Record<RouteScoreComponent["component"], string> = {
  route_length: "路线长度",
  inventory_coverage: "库存覆盖",
  passive_concentration: "被动集中度",
  borrowing: "公会借用成本",
  intermediate_cost: "中间帕鲁成本",
  attempt_cost: "预计尝试成本",
  stability: "路线稳定性",
  acquisition_cost: "缺失库存成本",
};

const difficultyLabels: Record<BreedingRoute["difficulty"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const recipeTypeLabels: Record<
  BreedingRoute["steps"][number]["recipe_type"],
  string
> = {
  normal: "常规配方",
  special: "特殊配方",
};

export function BreedingJobView({
  initialResult,
  poll = true,
}: Readonly<{ initialResult: BreedingJobDetailRpcSuccess; poll?: boolean }>) {
  const router = useRouter();
  const [result, setResult] = useState(initialResult);
  const [selectedKey, setSelectedKey] = useState(
    initialResult.data.plan?.routes[0]?.route_key ?? null,
  );
  const [pollPaused, setPollPaused] = useState(false);
  const [adoptingRouteId, setAdoptingRouteId] = useState<string | null>(null);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  useEffect(() => {
    if (!poll || terminal.has(result.data.status)) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 60) {
        window.clearInterval(timer);
        setPollPaused(true);
        return;
      }
      void fetch(`/api/breeder/jobs/${result.data.job_id}`, {
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((payload: unknown) => {
          const next = parsePolledJob(payload);
          if (next.ok) {
            setResult(next);
            setSelectedKey((current) =>
              next.data.plan?.routes.some(
                (route) => route.route_key === current,
              )
                ? current
                : (next.data.plan?.routes[0]?.route_key ?? null),
            );
            if (terminal.has(next.data.status)) window.clearInterval(timer);
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [poll, result.data.job_id, result.data.status]);
  const plan = result.data.plan;
  const searchIncomplete =
    plan?.explanation_codes.includes("SEARCH_INCOMPLETE") === true ||
    plan?.explanation_codes.includes("SEARCH_LIMIT_REACHED") === true ||
    plan?.diagnostics.search_complete === false;
  const selected = useMemo(
    () =>
      plan?.routes.find((route) => route.route_key === selectedKey) ??
      plan?.routes[0],
    [plan, selectedKey],
  );
  const palNames = useMemo(
    () =>
      new Map(
        result.data.localization.pals.map((pal) => [
          pal.pal_id,
          pal.display_name,
        ]),
      ),
    [result.data.localization.pals],
  );
  const passiveNames = useMemo(
    () =>
      new Map(
        result.data.localization.passive_skills.map((passive) => [
          passive.passive_skill_id,
          passive.display_name,
        ]),
      ),
    [result.data.localization.passive_skills],
  );

  async function adoptSelectedRoute(route: BreedingRoute): Promise<void> {
    setAdoptingRouteId(route.route_id);
    setAdoptionError(null);
    try {
      const response = await fetch("/api/plans/adopt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          route_id: route.route_id,
          idempotency_key: `adopt:${route.route_id}`,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error_code" in payload &&
          typeof payload.error_code === "string"
            ? payload.error_code
            : "ROUTE_NOT_ADOPTABLE";
        throw new Error(code);
      }
      const adopted = parseAdoption(payload);
      router.push(`/plans/${adopted.plan_id}`);
    } catch (error) {
      setAdoptionError(
        error instanceof Error ? error.message : "ROUTE_NOT_ADOPTABLE",
      );
    } finally {
      setAdoptingRouteId(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <section className="content-panel min-w-0" aria-live="polite">
        <p className="eyebrow">JOB PROGRESS</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">真实任务阶段</h2>
            <p className="mt-2 text-sm text-slate-300" data-testid="job-stage">
              {result.data.status} · {stageLabels[result.data.status]}
            </p>
          </div>
          <span className="level-chip">尝试 {result.data.attempt_count}</span>
        </div>
        {pollPaused ? (
          <p className="notice-banner mt-4" role="status">
            自动刷新已暂停，请手动刷新页面继续查看。
          </p>
        ) : null}
        {result.data.error_code === null ? null : (
          <p className="notice-banner mt-4" role="alert">
            稳定错误码：{result.data.error_code}
          </p>
        )}
      </section>

      <section className="content-panel min-w-0" aria-label="配种目标摘要">
        <p className="eyebrow">BREEDING TARGET</p>
        <h2 className="mt-3 text-xl font-semibold text-white">
          {localizedName(palNames, result.data.target_pal_id, "Pal")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {result.data.desired_passive_ids.length === 0 ? (
            <span className="text-sm text-slate-400">未指定期望被动</span>
          ) : (
            result.data.desired_passive_ids.map((id) => (
              <span className="passive-chip" key={id}>
                {localizedName(passiveNames, id, "被动")}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="content-panel min-w-0">
        <p className="eyebrow">PINNED VERSIONS</p>
        <dl className="fixed-inputs mt-4 md:grid-cols-2">
          <div>
            <dt>库存快照</dt>
            <dd>{result.data.inventory_snapshot_id}</dd>
          </div>
          <div>
            <dt>目录版本</dt>
            <dd>{result.data.game_data_version_id}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd>{result.data.game_data_content_hash}</dd>
          </div>
          <div>
            <dt>算法</dt>
            <dd>{result.data.algorithm_version}</dd>
          </div>
          <div>
            <dt>评分</dt>
            <dd>{result.data.scoring_profile_version}</dd>
          </div>
          <div>
            <dt>优化模式</dt>
            <dd>{optimizationModeLabels[result.data.optimization_mode]}</dd>
          </div>
        </dl>
      </section>

      {plan === null ? null : plan.routes.length === 0 && searchIncomplete ? (
        <section className="state-card" role="status">
          <p className="eyebrow">BOUNDED SEARCH INCOMPLETE</p>
          <h2 className="mt-3 text-xl font-semibold text-white">
            搜索达到安全上限
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            当前结果不能证明不存在合法路线。可降低最大代数、减少期望被动，或缩小可借用库存范围后创建新任务。
          </p>
        </section>
      ) : plan.routes.length === 0 ? (
        <section className="state-card" role="status">
          <p className="eyebrow">NO LEGAL ROUTE</p>
          <h2 className="mt-3 text-xl font-semibold text-white">
            当前没有合法路线
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            可减少期望被动、提高最大代数，或在确认共享权限后允许使用公会库存，再创建新任务。
          </p>
        </section>
      ) : (
        <>
          {searchIncomplete ? (
            <p className="notice-banner" role="status">
              已返回当前最优候选；搜索受到安全预算限制，未穷举全部路线。
            </p>
          ) : null}
          <section className="content-panel min-w-0">
            <div className="route-tabs" aria-label="路线比较">
              {plan.routes.map((route) => (
                <button
                  type="button"
                  key={route.route_key}
                  className={
                    route.route_key === selected?.route_key
                      ? "route-tab-active"
                      : "route-tab"
                  }
                  onClick={() => setSelectedKey(route.route_key)}
                >
                  路线 {route.rank}
                </button>
              ))}
            </div>
            {selected === undefined ? null : (
              <>
                <RouteFacts
                  route={selected}
                  palNames={palNames}
                  passiveNames={passiveNames}
                />
                {result.data.status !== "completed" ? null : (
                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
                    {selected.execution_plan_id !== null ? (
                      <Link
                        className="primary-button"
                        href={`/plans/${selected.execution_plan_id}`}
                      >
                        查看执行计划
                      </Link>
                    ) : selected.adoptable ? (
                      <button
                        className="primary-button"
                        disabled={adoptingRouteId !== null}
                        onClick={() => void adoptSelectedRoute(selected)}
                      >
                        {adoptingRouteId === selected.route_id
                          ? "正在采用…"
                          : "采用此方案"}
                      </button>
                    ) : (
                      <p className="notice-banner" role="status">
                        补齐库存后才可采用此方案
                      </p>
                    )}
                    {adoptionError === null ? null : (
                      <p className="text-sm text-rose-200" role="alert">
                        {adoptionError}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="content-panel min-w-0">
            <p className="eyebrow">AI EXPLANATION · NON-AUTHORITATIVE</p>
            <h2 className="mt-3 text-xl font-semibold text-white">
              AI 辅助解释（不改变确定性事实）
            </h2>
            {plan.ai.degraded ? (
              <p className="notice-banner mt-4" role="status">
                解释已降级
              </p>
            ) : null}
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {selected?.ai_explanation ?? plan.ai.explanation ?? "暂无解释"}
            </p>
            {selected?.ai_labels.length ? (
              <p className="mt-3 text-xs text-slate-400">
                标签：{selected.ai_labels.join(" · ")}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function RouteFacts({
  route,
  palNames,
  passiveNames,
}: Readonly<{
  route: BreedingRoute;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  const currentScore = route.score_breakdown.mode_scores.find(
    (score) => score.optimization_mode === route.optimization_mode,
  );
  return (
    <div className="mt-5 grid min-w-0 gap-5">
      <div className="route-metrics">
        <Metric label="总分" value={route.total_score.toFixed(2)} />
        <Metric label="代数" value={String(route.generation_count)} />
        <Metric label="借用数" value={String(route.borrowed_pal_count)} />
        <Metric
          label="库存覆盖率"
          value={`${Math.round(route.inventory_coverage * 100)}%`}
        />
        <Metric label="难度" value={difficultyLabels[route.difficulty]} />
        <Metric
          label="尝试区间"
          value={`${route.estimated_attempts_min}–${route.estimated_attempts_max}`}
        />
      </div>
      {route.missing_requirements.length === 0 ? null : (
        <section className="notice-banner" aria-label="仍缺少的 Pal">
          <h3 className="font-semibold text-white">
            仍需准备 {route.missing_pal_count} 只 Pal
          </h3>
          <ul className="mt-3 grid gap-2 text-sm text-slate-200">
            {route.missing_requirements.map((requirement) => (
              <li
                key={`${requirement.pal_id}:${requirement.gender}:${requirement.required_passive_ids.join(",")}`}
              >
                {requirement.quantity}×{" "}
                {localizedName(palNames, requirement.pal_id, "Pal")} ·{" "}
                {genderRequirementLabel(requirement.gender)}
                {requirement.required_passive_ids.length === 0
                  ? ""
                  : ` · 被动 ${localizedNames(passiveNames, requirement.required_passive_ids, "被动").join("、")}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4">
        {route.steps.map((step) => {
          const parents = [step.parent_a, step.parent_b].toSorted(
            (left, right) =>
              genderOrder(left.gender) - genderOrder(right.gender),
          );
          return (
            <article className="route-step" key={step.step_index}>
              <p className="eyebrow">
                第 {step.generation} 代 · {recipeTypeLabels[step.recipe_type]}
              </p>
              <div className="parent-grid mt-4">
                {parents.map((parent, index) => (
                  <ParentCard
                    key={`${parent.source_type}:${parent.instance_uid ?? parent.pal_id}:${index}`}
                    label={parentRoleLabel(parent.gender, index)}
                    parent={parent}
                    palNames={palNames}
                    passiveNames={passiveNames}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-300">
                子代：
                <strong className="text-white">
                  {localizedName(palNames, step.child_pal_id, "Pal")}
                </strong>
                {step.required_passive_ids.length
                  ? ` · 被动 ${localizedNames(passiveNames, step.required_passive_ids, "被动").join("、")}`
                  : ""}
              </p>
            </article>
          );
        })}
      </div>
      <section className="score-panel">
        <h3 className="text-lg font-semibold text-white">完整评分明细</h3>
        <p className="mt-2 text-xs text-slate-400">
          估算依据：策略启发式，不是已验证概率。
        </p>
        <div className="mt-4 grid gap-2">
          <div className="score-row score-row-heading" aria-hidden="true">
            <span>评分项</span>
            <span>标准分 × 权重</span>
            <strong>加权分</strong>
          </div>
          {currentScore?.components.map((component) => (
            <div className="score-row" key={component.component}>
              <span>{scoreComponentLabels[component.component]}</span>
              <span>
                {component.normalized_score.toFixed(1)} ×{" "}
                {component.weight.toFixed(2)}
              </span>
              <strong>{component.weighted_score.toFixed(2)}</strong>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {route.score_breakdown.mode_scores.map((score) => (
            <span className="passive-chip" key={score.optimization_mode}>
              {optimizationModeLabels[score.optimization_mode]}：
              {score.total_score.toFixed(2)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function ParentCard({
  label,
  parent,
  palNames,
  passiveNames,
}: Readonly<{
  label: string;
  parent: BreedingRouteViewParent;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  const passives =
    parent.source_type === "missing"
      ? parent.required_passive_ids
      : parent.passive_skill_ids;
  return (
    <div className="parent-card">
      <p className="detail-label">{label}</p>
      <h3 className="mt-2 font-semibold text-white">
        {localizedName(palNames, parent.pal_id, "Pal")}
      </h3>
      <p className="mt-2 break-all text-xs text-teal-100">
        {parent.instance_uid ??
          (parent.source_type === "missing" ? "尚未入库" : "中间产物")}
      </p>
      <p className="mt-3 text-sm text-slate-300">
        <span>{parent.owner_display_name}</span> ·{" "}
        {genderRequirementLabel(parent.gender)}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {parent.location_name ??
          parent.location_type ??
          (parent.source_type === "missing" ? "需补充库存" : "中间步骤")}
      </p>
      <p className="mt-3 text-xs text-slate-300">
        被动：
        {localizedNames(passiveNames, passives, "被动").join("、") || "无要求"}
      </p>
    </div>
  );
}

function localizedName(
  names: ReadonlyMap<string, string>,
  id: string,
  entityLabel: string,
): string {
  return names.get(id) ?? `未翻译${entityLabel}（${id}）`;
}

function localizedNames(
  names: ReadonlyMap<string, string>,
  ids: readonly string[],
  entityLabel: string,
): string[] {
  return ids.map((id) => localizedName(names, id, entityLabel));
}

function genderOrder(gender: BreedingRouteViewParent["gender"]): number {
  if (gender === "male") return 0;
  if (gender === "female") return 1;
  return 2;
}

function parentRoleLabel(
  gender: BreedingRouteViewParent["gender"],
  index: number,
): string {
  if (gender === "male") return "父本";
  if (gender === "female") return "母本";
  return `亲本 ${index + 1}`;
}

function genderRequirementLabel(
  gender: BreedingRouteViewParent["gender"],
): string {
  if (gender === "male") return "雄性";
  if (gender === "female") return "雌性";
  return "性别待定";
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
