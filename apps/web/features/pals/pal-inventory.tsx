"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { Crown, MapPin, ShieldCheck, UserRound, Warehouse } from "lucide-react";
import { useState } from "react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { PageEmpty } from "@/components/states/page-empty";
import { StatusChip } from "@/components/status/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const genderLabels = {
  male: "雄性",
  female: "雌性",
  genderless: "无性别",
  unknown: "未知性别",
} as const;

const genderSymbols = {
  male: "♂",
  female: "♀",
  genderless: "—",
  unknown: "?",
} as const;

const locationLabels = {
  player_party: "队伍",
  player_storage: "终端",
  base: "据点",
  dimensional_storage: "次元仓库",
  viewing_cage: "观赏笼",
  unknown: "未知位置",
} as const;

function storagePage(slotIndex: number): string {
  return `第 ${Math.floor(slotIndex / 30) + 1} 页 · 第 ${(slotIndex % 30) + 1} 格`;
}

function locationDisplay(pal: PalInventoryPage["items"][number]): {
  label: string;
  detail: string | null;
} {
  if (pal.location_type === "base") {
    const base = pal.location_name ?? locationLabels.base;
    return {
      label:
        pal.location_slot_index === null
          ? base
          : `${base} · 工作位 ${pal.location_slot_index + 1}`,
      detail: null,
    };
  }
  if (
    (pal.location_type === "player_storage" ||
      pal.location_type === "dimensional_storage") &&
    pal.location_slot_index !== null
  ) {
    return {
      label: locationLabels[pal.location_type],
      detail: storagePage(pal.location_slot_index),
    };
  }
  if (
    pal.location_type === "player_party" &&
    pal.location_slot_index !== null
  ) {
    return {
      label: locationLabels.player_party,
      detail: `队伍第 ${pal.location_slot_index + 1} 位`,
    };
  }
  return { label: locationLabels[pal.location_type], detail: null };
}

function shareLabel(
  pal: PalInventoryPage["items"][number],
  dimensionalSharingUnresolved: boolean,
): string {
  if (dimensionalSharingUnresolved) return "共享权限未确认";
  if (pal.ownership_scope === "guild") return "公会所有";
  return pal.share_enabled ? "公会可用" : "仅自己";
}

type ToggleShare = (
  palInstanceUid: string,
  enabled: boolean,
) => void | Promise<void>;

export function PalInventory({
  page,
  passiveRanks = {},
  onToggleShare,
}: Readonly<{
  page: PalInventoryPage;
  passiveRanks?: Readonly<Record<string, number>>;
  onToggleShare?: ToggleShare;
}>) {
  const [items, setItems] = useState(page.items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<Phase5ErrorCode | null>(null);

  async function toggle(palInstanceUid: string, enabled: boolean) {
    setPendingId(palInstanceUid);
    setErrorCode(null);
    try {
      if (onToggleShare !== undefined) {
        await onToggleShare(palInstanceUid, enabled);
      } else {
        const response = await fetch(
          `/api/pals/${encodeURIComponent(palInstanceUid)}/share`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled }),
            cache: "no-store",
          },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          setErrorCode(
            typeof payload === "object" &&
              payload !== null &&
              "error_code" in payload &&
              payload.error_code === "PAL_NOT_OWNED"
              ? "PAL_NOT_OWNED"
              : "DATA_UNAVAILABLE",
          );
          return;
        }
      }
      setItems((current) =>
        current.map((item) =>
          item.pal_instance_uid === palInstanceUid
            ? { ...item, share_enabled: enabled }
            : item,
        ),
      );
    } catch {
      setErrorCode("DATA_UNAVAILABLE");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="帕鲁库存结果">
      {page.catalog_state === "not_configured" ? (
        <Alert
          role="status"
          className="rounded-2xl border-amber-200 bg-amber-50/90 text-amber-950 shadow-soft"
        >
          <Warehouse aria-hidden="true" className="size-5" />
          <AlertTitle>游戏目录尚未配置</AlertTitle>
          <AlertDescription className="text-amber-900">
            当前仅显示和搜索 Stable ID，中文名称、图鉴编号与被动品级暂不可用。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-sm font-medium text-muted-foreground"
          aria-live="polite"
        >
          共 {page.total_count.toLocaleString("zh-CN")} 只可见帕鲁
        </p>
        <p className="text-xs text-muted-foreground">
          当前第 {page.page_number} 页
        </p>
      </div>

      {errorCode !== null ? (
        <Alert
          variant="destructive"
          role="alert"
          className="rounded-2xl border-rose-200 bg-rose-50 text-rose-900"
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          <AlertTitle>共享状态未更新</AlertTitle>
          <AlertDescription className="text-rose-800">
            {errorCode === "PAL_NOT_OWNED"
              ? "只有当前拥有者可以修改共享状态。"
              : "更新失败，原共享状态保持不变，请稍后重试。"}
          </AlertDescription>
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <PageEmpty
          title="没有匹配的帕鲁"
          description="尝试清空部分筛选，或切换“全部 / 我的帕鲁 / 公会共享”范围。"
        />
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((pal) => {
            const location = locationDisplay(pal);
            const dimensionalSharingUnresolved =
              pal.location_type === "dimensional_storage" &&
              pal.location_access_scope !== "guild";
            const isPending = pendingId === pal.pal_instance_uid;
            const switchId = `pal-share-${pal.pal_instance_uid}`;

            return (
              <Card
                role="article"
                data-pal-id={pal.pal_id}
                className="min-w-0 gap-0 overflow-hidden rounded-3xl border-glass-border bg-card/92 py-0 shadow-soft transition-[transform,box-shadow] motion-reduce:transition-none md:hover:-translate-y-0.5 md:hover:shadow-float"
                key={pal.pal_instance_uid}
              >
                <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                  <PalPortrait
                    palId={pal.pal_id}
                    name={pal.pal_display_name}
                    catalogNumber={pal.encyclopedia_no}
                    size={76}
                    className="size-[4.75rem] rounded-2xl"
                  />
                  <div className="min-w-0 self-center">
                    <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
                      {pal.pal_display_name}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {pal.encyclopedia_no === null
                        ? "图鉴编号未知"
                        : `#${String(pal.encyclopedia_no).padStart(3, "0")}`}
                    </p>
                    <p
                      className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground"
                      title={pal.pal_id}
                    >
                      {pal.pal_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge className="rounded-full bg-primary/10 text-primary">
                      Lv. {pal.level ?? "—"}
                    </Badge>
                    {pal.is_boss === true ? (
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-full border-amber-300 bg-amber-50 text-amber-900"
                      >
                        <Crown aria-hidden="true" className="size-3" />
                        头目
                      </Badge>
                    ) : null}
                  </div>
                  {pal.catalog_entry_state === "resolved" ? null : (
                    <p className="col-span-3 text-xs font-medium text-amber-800">
                      未解析目录项
                    </p>
                  )}
                </CardHeader>

                <CardContent className="grid gap-4 px-4 py-5 sm:px-5">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0 rounded-2xl bg-accent/55 p-3">
                      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <UserRound aria-hidden="true" className="size-3.5" />
                        所有者
                      </dt>
                      <dd className="mt-1 truncate font-semibold text-foreground">
                        {pal.owner_display_name}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-accent/55 p-3">
                      <dt className="text-xs font-semibold text-muted-foreground">
                        性别
                      </dt>
                      <dd className="mt-1 font-semibold text-foreground">
                        <span className="mr-1 text-primary" aria-hidden="true">
                          {genderSymbols[pal.gender]}
                        </span>
                        {genderLabels[pal.gender]}
                      </dd>
                    </div>
                    <div className="col-span-2 min-w-0 rounded-2xl bg-accent/55 p-3">
                      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <MapPin aria-hidden="true" className="size-3.5" />
                        位置
                      </dt>
                      <dd className="mt-1 font-semibold text-foreground">
                        {location.label}
                        {location.detail === null ? null : (
                          <span className="mt-0.5 block font-normal text-muted-foreground">
                            {location.detail}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      被动词条
                    </p>
                    <div
                      className="flex min-h-7 flex-wrap gap-1.5"
                      aria-label="被动技能"
                    >
                      {pal.passive_display_names.length > 0 ? (
                        pal.passive_display_names.map((passive, index) => {
                          const passiveId = pal.passive_skill_ids[index] ?? "";
                          const isUnknown =
                            pal.unknown_passive_skill_ids.includes(passiveId);
                          return (
                            <PassiveBadge
                              key={`${passiveId}-${index}`}
                              name={
                                isUnknown ? `未知被动 · ${passive}` : passive
                              }
                              rank={
                                isUnknown
                                  ? null
                                  : (passiveRanks[passiveId] ?? null)
                              }
                            />
                          );
                        })
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          无被动词条
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="mt-auto min-h-16 justify-between gap-3 border-t border-border/70 bg-accent/28 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">
                      共享状态
                    </p>
                    <div className="mt-1">
                      <StatusChip
                        tone={
                          dimensionalSharingUnresolved || !pal.share_enabled
                            ? "warning"
                            : "good"
                        }
                      >
                        {shareLabel(pal, dimensionalSharingUnresolved)}
                      </StatusChip>
                    </div>
                  </div>

                  {pal.is_owned_by_requester &&
                  !dimensionalSharingUnresolved ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Label
                        htmlFor={switchId}
                        className="text-xs font-semibold text-foreground"
                      >
                        公会共享
                      </Label>
                      <Switch
                        id={switchId}
                        checked={pal.share_enabled}
                        disabled={isPending}
                        aria-label={`${pal.pal_display_name} 公会共享`}
                        aria-busy={isPending}
                        onCheckedChange={(enabled) =>
                          void toggle(pal.pal_instance_uid, enabled)
                        }
                      />
                    </div>
                  ) : dimensionalSharingUnresolved ? (
                    <p className="max-w-40 text-right text-[0.68rem] leading-4 text-muted-foreground">
                      次元仓库权限未确认，暂不加入公会共享
                    </p>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
