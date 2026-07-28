"use client";

import type { BreederJobStatus } from "@palhatch/contracts";
import {
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
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

const stageIcons = {
  pending: Clock3,
  processing: LoaderCircle,
  algorithm_completed: CheckCircle2,
  ai_enriching: LoaderCircle,
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
}: Readonly<{
  status: BreederJobStatus;
  attemptCount: number;
  errorCode: string | null;
  pollPaused: boolean;
}>) {
  const t = useCopy("Breeder");
  const label = t(`${status}Label`);
  const StageIcon = stageIcons[status];
  const active = status === "processing" || status === "ai_enriching";

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
      aria-label={t("jobStageLabel")}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl border",
              status === "failed" || status === "cancelled"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-primary",
            )}
          >
            <StageIcon
              aria-hidden="true"
              className={cn(
                "size-4",
                active && "motion-safe:animate-spin motion-reduce:animate-none",
              )}
            />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              {t("jobStatus")}
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">{label}</h2>
            <p
              className="mt-1 font-mono text-xs text-muted-foreground"
              data-testid="job-stage"
            >
              {t("jobAttempt", { status, count: attemptCount })}
            </p>
          </div>
        </div>
        <StatusChip tone={stageTones[status]}>{label}</StatusChip>
      </div>

      {pollPaused ? (
        <Alert
          role="status"
          className="mt-4 rounded-2xl border-amber-200 bg-amber-50/92 text-amber-950"
        >
          <PauseCircle aria-hidden="true" className="size-4" />
          <AlertTitle>{t("refreshPausedTitle")}</AlertTitle>
          <AlertDescription className="text-amber-900">
            {t("refreshPausedDescription")}
          </AlertDescription>
        </Alert>
      ) : null}

      {errorCode === null ? null : (
        <Alert
          variant="destructive"
          className="mt-4 rounded-2xl border-rose-200 bg-rose-50/94"
        >
          <TriangleAlert aria-hidden="true" className="size-4" />
          <AlertTitle>{t("stableErrorTitle")}</AlertTitle>
          <AlertDescription className="font-mono break-all">
            {errorCode}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
