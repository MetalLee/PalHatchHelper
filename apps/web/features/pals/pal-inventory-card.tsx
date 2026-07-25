import type { PalInventoryPage } from "@palhatch/contracts";
import {
  CircleHelp,
  CircleOff,
  Crown,
  MapPin,
  Mars,
  UserRound,
  Venus,
  type LucideIcon,
} from "lucide-react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PalInventoryItem = PalInventoryPage["items"][number];

const genderLabels = {
  male: "雄性",
  female: "雌性",
  genderless: "无性别",
  unknown: "未知性别",
} as const;

const genderIcons: Record<PalInventoryItem["gender"], LucideIcon> = {
  male: Mars,
  female: Venus,
  genderless: CircleOff,
  unknown: CircleHelp,
};

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

function locationDisplay(pal: PalInventoryItem): {
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
  pal: PalInventoryItem,
  dimensionalSharingUnresolved: boolean,
): string {
  if (dimensionalSharingUnresolved) return "共享权限未确认";
  if (pal.ownership_scope === "guild") return "公会所有";
  return pal.share_enabled ? "公会可用" : "仅自己";
}

export function PalInventoryCard({
  pal,
  passiveRanks,
  pending,
  onToggleShare,
}: Readonly<{
  pal: PalInventoryItem;
  passiveRanks: Readonly<Record<string, number>>;
  pending: boolean;
  onToggleShare: (palInstanceUid: string, enabled: boolean) => void;
}>) {
  const location = locationDisplay(pal);
  const dimensionalSharingUnresolved =
    pal.location_type === "dimensional_storage" &&
    pal.location_access_scope !== "guild";
  const switchId = `pal-share-${pal.pal_instance_uid}`;
  const GenderIcon = genderIcons[pal.gender];

  return (
    <Card
      role="article"
      data-pal-id={pal.pal_id}
      className="min-w-0 gap-0 overflow-hidden rounded-3xl border-glass-border bg-card/92 py-0 shadow-soft transition-[transform,box-shadow] motion-reduce:transition-none md:hover:-translate-y-0.5 md:hover:shadow-float"
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
            <dd className="mt-1 flex items-center gap-1 font-semibold text-foreground">
              <GenderIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
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
          <div className="flex min-h-7 flex-wrap gap-1.5" aria-label="被动技能">
            {pal.passive_display_names.length > 0 ? (
              pal.passive_display_names.map((passive, index) => {
                const passiveId = pal.passive_skill_ids[index] ?? "";
                const isUnknown =
                  pal.unknown_passive_skill_ids.includes(passiveId);
                return (
                  <PassiveBadge
                    key={`${passiveId}-${index}`}
                    name={isUnknown ? `未知被动 · ${passive}` : passive}
                    rank={isUnknown ? null : (passiveRanks[passiveId] ?? null)}
                  />
                );
              })
            ) : (
              <span className="text-xs text-muted-foreground">无被动词条</span>
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

        {pal.is_owned_by_requester && !dimensionalSharingUnresolved ? (
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
              disabled={pending}
              aria-label={`${pal.pal_display_name} 公会共享`}
              aria-busy={pending}
              onCheckedChange={(enabled) =>
                onToggleShare(pal.pal_instance_uid, enabled)
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
}
