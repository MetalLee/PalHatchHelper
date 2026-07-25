import type { InventoryDataStatus } from "@palhatch/contracts";
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
import { GlassPanel } from "@/components/surfaces/glass-panel";
import { StatusChip } from "@/components/status/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

import {
  dataStatusPresentation,
  gameDataStatusPresentation,
} from "./presentation";

export function formatDataStatusTime(value: string | null): string {
  if (value === null) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

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
  value: string;
  detail: string;
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
  const inventory = dataStatusPresentation(data.state);
  const gameData = gameDataStatusPresentation(data.game_data_state);
  const parserValue =
    data.parser_name === null
      ? "尚未上报"
      : `${data.parser_name} · ${data.parser_version ?? "unknown"}`;
  const parserState =
    data.state === "parse_error"
      ? { title: "Parser 异常", tone: "danger" as const }
      : data.parser_name === null
        ? { title: "Parser 未上报", tone: "neutral" as const }
        : { title: "Parser 已就绪", tone: "good" as const };

  return (
    <div className="grid min-w-0 gap-5">
      <PageHero
        eyebrow="DATA HEALTH"
        title="数据状态"
        description="查看脱敏库存同步、Parser 与固定版本事实。这里不读取原始存档、服务器路径、内部堆栈或其他玩家数据。"
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
        aria-label="数据状态摘要"
      >
        <StatusCard
          label="存档同步"
          value={inventory.title}
          detail={
            data.using_previous_snapshot
              ? "当前安全保留上一份成功发布的库存。"
              : inventory.description
          }
          icon={data.state === "parse_error" ? FileWarning : RefreshCw}
          tone={inventory.tone}
        />
        <StatusCard
          label="解析状态"
          value={parserState.title}
          detail={parserValue}
          icon={data.state === "parse_error" ? FileWarning : FileCheck2}
          tone={parserState.tone}
        />
        <StatusCard
          label="最近更新时间"
          value={formatDataStatusTime(data.captured_at)}
          detail={`最近同步尝试：${formatDataStatusTime(data.last_attempt_at)}`}
          icon={Clock3}
          tone={data.state === "stale" ? "warning" : "neutral"}
        />
        <StatusCard
          label="数据或目录版本"
          value={gameData.title}
          detail={
            data.game_build_id === null
              ? "Build 尚未配置"
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
                同步时间线
              </h2>
              <p className="text-sm text-muted-foreground">
                仅展示当前安全投影中的三个时间事实。
              </p>
            </div>
          </div>
          <ol className="mt-5 grid gap-4">
            {[
              {
                label: "存档最后修改",
                value: formatDataStatusTime(data.source_modified_at),
                icon: FileClock,
              },
              {
                label: "有效快照捕获",
                value: formatDataStatusTime(data.captured_at),
                icon: FileCheck2,
              },
              {
                label: "最近同步尝试",
                value: formatDataStatusTime(data.last_attempt_at),
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
                版本信息
              </h2>
              <p className="text-sm text-muted-foreground">
                配种计算固定使用确定性版本。
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-muted-foreground">Parser 名称与版本</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {parserValue}
              </dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/60 p-4">
                <dt className="text-muted-foreground">游戏版本</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {data.game_version ?? "未知"}
                </dd>
              </div>
              <div className="rounded-2xl bg-white/60 p-4">
                <dt className="text-muted-foreground">Build</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {data.game_build_id ?? "未知"}
                </dd>
              </div>
            </div>
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-muted-foreground">确定性算法版本</dt>
              <dd className="mt-1">
                <SafeCode>{data.algorithm_version ?? "未配置"}</SafeCode>
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
              异常提醒
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
                  ? "当前使用上一份有效快照"
                  : "最近同步存在异常"}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p>失败解析结果不会部分发布；玩家仍看到上一份完整有效库存。</p>
                <SafeCode>{data.error_code ?? "NO_ERROR_CODE"}</SafeCode>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
              <p className="font-semibold text-emerald-900">未发现同步异常</p>
              <p className="mt-1 text-sm text-emerald-800">
                当前没有稳定错误码，也没有使用上一份有效快照。
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
                固定数据详情
              </h2>
              <p className="text-sm text-muted-foreground">
                UUID 可选中复制，不包含源存档哈希。
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3">
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-sm text-muted-foreground">库存快照 ID</dt>
              <dd className="mt-1">
                <SafeCode>{data.snapshot_id ?? "暂无"}</SafeCode>
              </dd>
            </div>
            <div className="rounded-2xl bg-white/60 p-4">
              <dt className="text-sm text-muted-foreground">游戏数据版本 ID</dt>
              <dd className="mt-1">
                <SafeCode>{data.game_data_version_id ?? "未配置"}</SafeCode>
              </dd>
            </div>
          </dl>
        </GlassPanel>
      </section>
    </div>
  );
}
