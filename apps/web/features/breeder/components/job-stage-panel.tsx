import type { BreederJobStatus } from "@palhatch/contracts";
import {
  Bot,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  PauseCircle,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusChip, type StatusTone } from "@/components/status/status-chip";
import { cn } from "@/lib/utils";

import { jobStagePresentation } from "../presentation";

const stageIcons = {
  pending: Clock3,
  processing: LoaderCircle,
  algorithm_completed: CheckCircle2,
  ai_enriching: Bot,
  retry_pending: RotateCcw,
  completed: CheckCircle2,
  failed: TriangleAlert,
  cancelled: XCircle,
} satisfies Record<BreederJobStatus, typeof Clock3>;

const stageTones = {
  pending: "neutral",
  processing: "neutral",
  algorithm_completed: "good",
  ai_enriching: "neutral",
  retry_pending: "warning",
  completed: "good",
  failed: "danger",
  cancelled: "danger",
} satisfies Record<BreederJobStatus, StatusTone>;

export function JobStagePanel({
  status,
  attemptCount,
  errorCode,
  pollPaused,
  aiDegraded,
}: Readonly<{
  status: BreederJobStatus;
  attemptCount: number;
  errorCode: string | null;
  pollPaused: boolean;
  aiDegraded: boolean;
}>) {
  const presentation = jobStagePresentation[status];
  const StageIcon = stageIcons[status];
  const active = status === "processing" || status === "ai_enriching";

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-5 shadow-soft backdrop-blur-md sm:p-6"
      aria-label="当前任务阶段"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-2xl border",
              status === "failed" || status === "cancelled"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-primary",
            )}
          >
            <StageIcon
              aria-hidden="true"
              className={cn(
                "size-5",
                active && "motion-safe:animate-spin motion-reduce:animate-none",
              )}
            />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Current job stage
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">
              {presentation.label}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {presentation.description}
            </p>
            <p
              className="mt-2 font-mono text-xs text-muted-foreground"
              data-testid="job-stage"
            >
              {status} · 尝试 {attemptCount}
            </p>
          </div>
        </div>
        <StatusChip tone={stageTones[status]}>{presentation.label}</StatusChip>
      </div>

      {pollPaused ? (
        <Alert
          role="status"
          className="mt-4 rounded-2xl border-amber-200 bg-amber-50/92 text-amber-950"
        >
          <PauseCircle aria-hidden="true" className="size-4" />
          <AlertTitle>自动刷新已暂停</AlertTitle>
          <AlertDescription className="text-amber-900">
            轮询已达到安全上限，请手动刷新页面继续查看。
          </AlertDescription>
        </Alert>
      ) : null}

      {errorCode === null ? null : (
        <Alert
          variant="destructive"
          className="mt-4 rounded-2xl border-rose-200 bg-rose-50/94"
        >
          <TriangleAlert aria-hidden="true" className="size-4" />
          <AlertTitle>任务返回稳定错误码</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {errorCode}
          </AlertDescription>
        </Alert>
      )}

      {aiDegraded ? (
        <Alert
          role="status"
          className="mt-4 rounded-2xl border-sky-200 bg-sky-50/92 text-sky-950"
        >
          <Bot aria-hidden="true" className="size-4" />
          <AlertTitle>解释已降级</AlertTitle>
          <AlertDescription className="text-sky-900">
            确定性算法结果与基础评分仍然完整；当前说明来自降级链路。
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
