"use client";

import type {
  BreederCatalogPalOption,
  BreederFormContext,
  CreateBreedingJobRequest,
  CreateBreedingJobResponse,
} from "@palhatch/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type CreateJob = (
  request: CreateBreedingJobRequest,
) => Promise<CreateBreedingJobResponse>;
type CreateJobInput = Omit<CreateBreedingJobRequest, "desired_passive_ids"> & {
  desired_passive_ids: string[];
};

const stableIdPattern = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jobStatuses = new Set<CreateBreedingJobResponse["status"]>([
  "pending",
  "processing",
  "algorithm_completed",
  "ai_enriching",
  "retry_pending",
  "completed",
  "failed",
  "cancelled",
]);

function buildCreateRequest(value: CreateJobInput): CreateBreedingJobRequest {
  const passives = value.desired_passive_ids;
  if (
    !stableIdPattern.test(value.target_pal_id) ||
    passives.length > 4 ||
    new Set(passives).size !== passives.length ||
    passives.some((id) => !stableIdPattern.test(id)) ||
    !Number.isInteger(value.max_generations) ||
    value.max_generations < 1 ||
    value.max_generations > 8
  ) {
    throw new Error("INVALID_BREEDING_REQUEST");
  }
  return value as CreateBreedingJobRequest;
}

function parseCreateResponse(value: unknown): CreateBreedingJobResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("job_id" in value) ||
    typeof value.job_id !== "string" ||
    !uuidPattern.test(value.job_id) ||
    !("reused" in value) ||
    typeof value.reused !== "boolean" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !jobStatuses.has(value.status as CreateBreedingJobResponse["status"])
  ) {
    throw new Error("DATA_UNAVAILABLE");
  }
  return value as CreateBreedingJobResponse;
}

function resolveTargetPal(
  pals: BreederCatalogPalOption[],
  query: string,
): BreederCatalogPalOption | undefined {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const encyclopediaQuery = normalized.startsWith("#")
    ? normalized.slice(1)
    : normalized;
  return pals.find(
    (pal) =>
      pal.pal_id.toLocaleLowerCase("en-US") === normalized ||
      pal.display_name.toLocaleLowerCase("zh-CN") === normalized ||
      (pal.encyclopedia_no !== null &&
        String(pal.encyclopedia_no) === encyclopediaQuery),
  );
}

async function createThroughApi(
  request: CreateBreedingJobRequest,
): Promise<CreateBreedingJobResponse> {
  const response = await fetch("/api/breeder/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
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
  return parseCreateResponse(payload);
}

export function BreederForm({
  context,
  createJob = createThroughApi,
}: Readonly<{ context: BreederFormContext; createJob?: CreateJob }>) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [passiveQuery, setPassiveQuery] = useState("");
  const [passives, setPassives] = useState<string[]>([]);
  const [mode, setMode] =
    useState<CreateBreedingJobRequest["optimization_mode"]>("balanced");
  const [allowShared, setAllowShared] = useState(true);
  const [maxGenerations, setMaxGenerations] = useState(5);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const visiblePassives = useMemo(() => {
    const query = passiveQuery.trim().toLocaleLowerCase("zh-CN");
    if (!query) return context.passive_skills;
    return context.passive_skills.filter(
      (skill) =>
        skill.passive_skill_id.includes(query) ||
        skill.display_name.toLocaleLowerCase("zh-CN").includes(query),
    );
  }, [context.passive_skills, passiveQuery]);
  const selectedPassives = useMemo(
    () =>
      passives.flatMap((id) => {
        const skill = context.passive_skills.find(
          (candidate) => candidate.passive_skill_id === id,
        );
        return skill === undefined ? [] : [skill];
      }),
    [context.passive_skills, passives],
  );

  function togglePassive(id: string): void {
    setPassives((current) => {
      if (current.includes(id)) {
        setErrorCode(null);
        return current.filter((value) => value !== id);
      }
      if (current.length >= 4) {
        setErrorCode("最多选择四个被动");
        return current;
      }
      setErrorCode(null);
      return [...current, id];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorCode(null);
    const selectedPal = resolveTargetPal(context.pals, target);
    if (selectedPal === undefined) {
      setErrorCode("INVALID_TARGET_PAL");
      return;
    }
    let request: CreateBreedingJobRequest;
    try {
      request = buildCreateRequest({
        target_pal_id: selectedPal.pal_id,
        desired_passive_ids: [...passives].sort(),
        optimization_mode: mode,
        allow_guild_shared: allowShared,
        max_generations: maxGenerations,
      });
    } catch {
      setErrorCode("INVALID_BREEDING_REQUEST");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createJob(request);
      router.push(`/breeder/jobs/${result.job_id}`);
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "DATA_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="breeder-layout" onSubmit={submit}>
      <section
        className="content-panel grid min-w-0 gap-5"
        aria-label="配种目标"
      >
        {context.data_state === "healthy" ? null : (
          <p className="notice-banner" role="status">
            当前库存状态为 {context.data_state}；任务仍会固定本页所示 published
            快照。
          </p>
        )}
        <label className="filter-field">
          <span>目标 Pal（名称、编号或 Stable ID）</span>
          <input
            aria-label="目标 Pal（名称、编号或 Stable ID）"
            type="search"
            list="breeder-pal-options"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="输入名称、编号或 Stable ID 后选择"
            required
          />
          <datalist id="breeder-pal-options">
            {context.pals.map((pal) => (
              <option key={pal.pal_id} value={pal.pal_id}>
                {pal.encyclopedia_no === null
                  ? ""
                  : `#${pal.encyclopedia_no} · `}
                {pal.display_name}
              </option>
            ))}
          </datalist>
        </label>

        <fieldset className="grid min-w-0 gap-3">
          <legend className="detail-label">期望被动（0 至 4 个）</legend>
          <section className="selected-passives" aria-label="已选择的被动">
            <div className="selected-passives-header">
              <strong>已选择 {passives.length} / 4</strong>
              {passives.length === 0 ? null : (
                <button
                  type="button"
                  onClick={() => {
                    setPassives([]);
                    setErrorCode(null);
                  }}
                >
                  清空
                </button>
              )}
            </div>
            {selectedPassives.length === 0 ? (
              <p>尚未选择被动</p>
            ) : (
              <div className="selected-passive-list">
                {selectedPassives.map((skill) => (
                  <button
                    className="selected-passive-chip"
                    type="button"
                    key={skill.passive_skill_id}
                    aria-label={`移除${skill.display_name}`}
                    onClick={() => togglePassive(skill.passive_skill_id)}
                  >
                    <span>{skill.display_name}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <label className="filter-field">
            <span>搜索被动名称或 Stable ID</span>
            <input
              type="search"
              value={passiveQuery}
              onChange={(event) => setPassiveQuery(event.target.value)}
              placeholder="筛选被动"
            />
          </label>
          <div className="passive-picker" aria-label="被动技能选择">
            {visiblePassives.length === 0 ? (
              <p className="passive-picker-empty">没有匹配的被动</p>
            ) : (
              visiblePassives.map((skill) => (
                <label className="passive-option" key={skill.passive_skill_id}>
                  <input
                    type="checkbox"
                    checked={passives.includes(skill.passive_skill_id)}
                    onChange={() => togglePassive(skill.passive_skill_id)}
                  />
                  <span>
                    <strong>{skill.display_name}</strong>
                    <small>{skill.passive_skill_id}</small>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>

        <div className="breeder-controls">
          <label className="filter-field">
            <span>优化模式</span>
            <select
              value={mode}
              onChange={(event) =>
                setMode(
                  event.target
                    .value as CreateBreedingJobRequest["optimization_mode"],
                )
              }
            >
              <option value="balanced">均衡</option>
              <option value="fastest">最快路线</option>
              <option value="highest_success">最高成功倾向</option>
              <option value="least_borrowing">最少借用</option>
            </select>
          </label>
          <label className="filter-field">
            <span>最大代数</span>
            <input
              type="number"
              min={1}
              max={8}
              value={maxGenerations}
              onChange={(event) =>
                setMaxGenerations(Number(event.target.value))
              }
            />
          </label>
          <label className="share-choice">
            <input
              type="checkbox"
              checked={allowShared}
              onChange={(event) => setAllowShared(event.target.checked)}
            />
            允许使用公会已共享实例
          </label>
        </div>
        {errorCode === null ? null : (
          <p className="notice-banner" role="alert">
            {errorCode}
          </p>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={!hydrated || submitting}
        >
          {submitting ? "正在创建…" : "创建配种任务"}
        </button>
      </section>

      <aside className="content-panel min-w-0" aria-label="固定版本">
        <p className="eyebrow">FIXED INPUTS</p>
        <h2 className="mt-3 text-lg font-semibold text-white">
          本次任务固定版本
        </h2>
        <dl className="fixed-inputs mt-5">
          <div>
            <dt>库存快照</dt>
            <dd>{context.inventory_snapshot_id}</dd>
          </div>
          <div>
            <dt>目录版本</dt>
            <dd>{context.game_data_version_id}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd>{context.game_data_content_hash}</dd>
          </div>
          <div>
            <dt>Build</dt>
            <dd>{context.game_build_id}</dd>
          </div>
          <div>
            <dt>游戏版本</dt>
            <dd>{context.game_version}</dd>
          </div>
          <div>
            <dt>算法</dt>
            <dd>{context.algorithm_version}</dd>
          </div>
          <div>
            <dt>评分</dt>
            <dd>{context.scoring_profile_versions[mode]}</dd>
          </div>
        </dl>
      </aside>
    </form>
  );
}
