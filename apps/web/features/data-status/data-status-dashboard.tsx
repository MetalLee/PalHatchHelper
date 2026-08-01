"use client";

import type { InventoryDataStatus } from "@palhatch/contracts";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Braces,
  Clock3,
  Database,
  FileCheck2,
  FileClock,
  FileWarning,
  Fingerprint,
  History,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { VisitorDateTime } from "@/components/formatters/visitor-date-time";
import { GlassPanel } from "@/components/surfaces/glass-panel";
import { StatusChip } from "@/components/status/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useAppLocale, useCopy } from "@/i18n/client";
import { catalogLocaleFor } from "@/i18n/routing";

import {
  dataStatusPresentation,
  gameDataStatusPresentation,
} from "./presentation";

function SafeCode({ children }: Readonly<{ children: string }>) {
  return (
    <code
      className="block max-w-full select-all break-all font-mono text-xs leading-5 text-foreground"
      title={children}
    >
      {children}
    </code>
  );
}

function StatusCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: Readonly<{
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: typeof RefreshCw;
  tone: "good" | "warning" | "danger" | "neutral";
}>) {
  const toneClass = {
    good: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    neutral: "bg-sky-100 text-sky-800",
  }[tone];

  return (
    <Card
      className="min-w-0 border-glass-border bg-card/90 shadow-soft"
      data-testid="data-status-card"
    >
      <CardContent className="flex min-h-36 items-start gap-4 p-5">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-2xl ${toneClass}`}
        >
          <Icon aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-xl font-bold text-foreground">
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DataStatusDashboard({
  data,
}: Readonly<{ data: InventoryDataStatus }>) {
  const locale = useAppLocale();
  const t = useCopy("DataStatus");
  const formatTime = (value: string | null) =>
    value === null ? (
      t("none")
    ) : (
      <VisitorDateTime
        value={value}
        locale={catalogLocaleFor(locale)}
        options={{ dateStyle: "medium", timeStyle: "medium" }}
      />
    );
  const inventory = dataStatusPresentation(data.state, t);
  const gameData = gameDataStatusPresentation(data.game_data_state, t);
  const parserValue =
    data.parser_name === null
      ? t("notReported")
      : `${data.parser_name} · ${data.parser_version ?? t("unknown")}`;
  const parserState =
    data.state === "parse_error"
      ? { title: t("parserError"), tone: "danger" as const }
      : data.parser_name === null
        ? { title: t("parserMissing"), tone: "neutral" as const }
        : { title: t("parserReady"), tone: "good" as const };

  return (
    <div className="grid min-w-0 gap-5">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <StatusChip tone={inventory.tone}>{inventory.title}</StatusChip>
        }
        visual={
          <div className="grid size-28 place-items-center rounded-full border border-white/80 bg-white/55 text-primary shadow-soft backdrop-blur-md sm:size-32">
            <ShieldCheck
              aria-hidden="true"
              className="size-14"
              strokeWidth={1.4}
            />
          </div>
        }
      />

      <section
        className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label={t("summaryLabel")}
      >
        <StatusCard
          label={t("saveSync")}
          value={inventory.title}
          detail={
            data.using_previous_snapshot
              ? t("previousSnapshotDetail")
              : inventory.description
          }
          icon={data.state === "parse_error" ? FileWarning : RefreshCw}
          tone={inventory.tone}
        />
        <StatusCard
          label={t("parserStatus")}
          value={parserState.title}
          detail={parserValue}
          icon={data.state === "parse_error" ? FileWarning : FileCheck2}
          tone={parserState.tone}
        />
        <StatusCard
          label={t("latestUpdate")}
          value={formatTime(data.captured_at)}
          detail={
            <>
              {t("lastAttempt", { date: "" })}
              {formatTime(data.last_attempt_at)}
            </>
          }
          icon={Clock3}
          tone={data.state === "stale" ? "warning" : "neutral"}
        />
        <StatusCard
          label={t("dataVersion")}
          value={gameData.title}
          detail={
            data.game_build_id === null
              ? t("buildMissing")
              : `Build ${data.game_build_id}`
          }
          icon={Database}
          tone={gameData.tone}
        />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <GlassPanel aria-labelledby="sync-timeline-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-800">
              <History aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                id="sync-timeline-title"
                className="text-lg font-bold text-foreground"
              >
                {t("timeline")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("timelineDescription")}
              </p>
            </div>
          </div>
          <ol className="mt-5 grid gap-4">
            {[
              {
                label: t("sourceModified"),
                value: formatTime(data.source_modified_at),
                icon: FileClock,
              },
              {
                label: t("snapshotCaptured"),
                value: formatTime(data.captured_at),
                icon: FileCheck2,
              },
              {
                label: t("lastAttemptLabel"),
                value: formatTime(data.last_attempt_at),
                icon: RefreshCw,
              },
            ].map((event) => {
              const Icon = event.icon;
              return (
                <li
                  className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-3"
                  key={event.label}
                >
                  <span className="grid size-10 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 rounded-2xl bg-white/60 px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {event.label}
                    </p>
                    <time className="mt-1 block text-sm tabular-nums text-muted-foreground">
                      {event.value}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </GlassPanel>

        <GlassPanel aria-labelledby="version-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Braces aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 id="version-title" className="text-lg font-bold">
                {t("versionInfo")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("versionDescription")}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-muted-foreground">{t("parserVersion")}</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {parserValue}
              </dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/60 p-4">
                <dt className="text-muted-foreground">{t("gameVersion")}</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {data.game_version ?? t("unknown")}
                </dd>
              </div>
              <div className="rounded-2xl bg-white/60 p-4">
                <dt className="text-muted-foreground">Build</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {data.game_build_id ?? t("unknown")}
                </dd>
              </div>
            </div>
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-muted-foreground">{t("algorithmVersion")}</dt>
              <dd className="mt-1">
                <SafeCode>
                  {data.algorithm_version ?? t("notConfigured")}
                </SafeCode>
              </dd>
            </div>
          </dl>
        </GlassPanel>
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        <GlassPanel aria-labelledby="warning-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <h2 id="warning-title" className="text-lg font-bold">
              {t("warnings")}
            </h2>
          </div>
          {data.error_code !== null || data.using_previous_snapshot ? (
            <Alert
              className="mt-5 border-amber-200 bg-amber-50/80"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>
                {data.using_previous_snapshot
                  ? t("usingPrevious")
                  : t("recentFailure")}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{t("failureDescription")}</p>
                <SafeCode>{data.error_code ?? "NO_ERROR_CODE"}</SafeCode>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="font-semibold text-emerald-900">{t("noFailure")}</p>
              <p className="mt-1 text-sm text-emerald-800">
                {t("noFailureDescription")}
              </p>
            </div>
          )}
          {data.game_data_state !== "published" ? (
            <Alert
              className="mt-3 border-amber-200 bg-amber-50/80"
              role="status"
            >
              <Database aria-hidden="true" />
              <AlertTitle>{gameData.title}</AlertTitle>
              <AlertDescription>{gameData.description}</AlertDescription>
            </Alert>
          ) : null}
        </GlassPanel>

        <GlassPanel aria-labelledby="fixed-data-title">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-800">
              <Fingerprint aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 id="fixed-data-title" className="text-lg font-bold">
                {t("fixedDetails")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("fixedDescription")}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3">
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-sm text-muted-foreground">
                {t("snapshotId")}
              </dt>
              <dd className="mt-1">
                <SafeCode>{data.snapshot_id ?? t("none")}</SafeCode>
              </dd>
            </div>
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-sm text-muted-foreground">
                {t("gameDataVersionId")}
              </dt>
              <dd className="mt-1">
                <SafeCode>
                  {data.game_data_version_id ?? t("notConfigured")}
                </SafeCode>
              </dd>
            </div>
          </dl>
        </GlassPanel>
      </section>
    </div>
  );
}
