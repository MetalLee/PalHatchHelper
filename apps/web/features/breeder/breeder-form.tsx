"use client";

import type {
  BreederCatalogPalOption,
  BreederFormContext,
  CreateBreedingJobRequest,
  CreateBreedingJobResponse,
} from "@palhatch/contracts";
import {
  AlertTriangle,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { BreederSettings } from "./components/breeder-settings";
import { BreederSubmitSummary } from "./components/breeder-submit-summary";
import { BreederVersionSummary } from "./components/breeder-version-summary";
import { OptimizationModePicker } from "./components/optimization-mode-picker";
import { PassiveSkillPicker } from "./components/passive-skill-picker";
import { TargetPalCombobox } from "./components/target-pal-combobox";

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

function SectionHeading({
  icon: Icon,
  title,
  description,
}: Readonly<{
  icon: typeof Target;
  title: string;
  description: string;
}>) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function BreederForm({
  context,
  createJob = createThroughApi,
}: Readonly<{ context: BreederFormContext; createJob?: CreateJob }>) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [passives, setPassives] = useState<string[]>([]);
  const [mode, setMode] =
    useState<CreateBreedingJobRequest["optimization_mode"]>("balanced");
  const [allowShared, setAllowShared] = useState(true);
  const [maxGenerations, setMaxGenerations] = useState(5);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const selectedPal = useMemo(
    () => resolveTargetPal(context.pals, target),
    [context.pals, target],
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
    <form
      data-testid="breeder-create-form"
      className="grid min-w-0 max-w-full gap-6 overflow-x-clip xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start"
      onSubmit={submit}
    >
      <div className="grid min-w-0 gap-6">
        <section
          className="grid min-w-0 gap-5 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-6"
          aria-label="配种目标"
        >
          <SectionHeading
            icon={Target}
            title="目标设置"
            description="从当前固定目录中选择目标 Pal，并确认任务真正要搜索的物种。"
          />
          {context.data_state === "healthy" ? null : (
            <Alert
              role="status"
              className="rounded-2xl border-amber-200 bg-amber-50/92 text-amber-950"
            >
              <AlertTriangle aria-hidden="true" className="size-5" />
              <AlertTitle>当前库存状态：{context.data_state}</AlertTitle>
              <AlertDescription className="text-amber-900">
                任务仍会固定本页所示 published 快照，请留意数据状态后再创建。
              </AlertDescription>
            </Alert>
          )}
          <TargetPalCombobox
            pals={context.pals}
            value={target}
            onValueChange={(value) => {
              setTarget(value);
              setErrorCode(null);
            }}
          />
        </section>

        <section className="grid min-w-0 gap-5 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-6">
          <SectionHeading
            icon={Sparkles}
            title="期望被动"
            description="搜索并选择最多四个词条；点击已选词条即可移除。"
          />
          <PassiveSkillPicker
            skills={context.passive_skills}
            selectedIds={passives}
            onToggle={togglePassive}
            onClear={() => {
              setPassives([]);
              setErrorCode(null);
            }}
          />
        </section>

        <section className="grid min-w-0 gap-6 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-6">
          <SectionHeading
            icon={SlidersHorizontal}
            title="路线偏好"
            description="选择评分倾向，并设置公会共享与确定性搜索边界。"
          />
          <OptimizationModePicker value={mode} onValueChange={setMode} />
          <BreederSettings
            allowShared={allowShared}
            onAllowSharedChange={setAllowShared}
            maxGenerations={maxGenerations}
            onMaxGenerationsChange={setMaxGenerations}
          />
        </section>
      </div>

      <div className="grid min-w-0 gap-4 xl:sticky xl:top-24">
        <BreederVersionSummary context={context} mode={mode} />
        {errorCode === null ? null : (
          <Alert
            variant="destructive"
            role="alert"
            className="rounded-2xl border-rose-200 bg-rose-50 text-rose-900"
          >
            <AlertTriangle aria-hidden="true" className="size-5" />
            <AlertTitle>无法创建任务</AlertTitle>
            <AlertDescription className="break-words text-rose-800">
              {errorCode}
            </AlertDescription>
          </Alert>
        )}
        <BreederSubmitSummary
          target={selectedPal}
          passiveCount={passives.length}
          mode={mode}
          allowShared={allowShared}
          disabled={!hydrated || submitting}
          submitting={submitting}
        />
      </div>
    </form>
  );
}
