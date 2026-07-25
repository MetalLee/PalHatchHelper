"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { LayoutGrid, List, ShieldCheck, Warehouse } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageEmpty } from "@/components/states/page-empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PalInventoryCard } from "./pal-inventory-card";
import { PalInventoryTable } from "./pal-inventory-table";
import type { PalInventoryView } from "./query";

type ToggleShare = (
  palInstanceUid: string,
  enabled: boolean,
) => void | Promise<void>;

export function PalInventory({
  page,
  view,
  viewHrefs,
  passiveRanks = {},
  onToggleShare,
}: Readonly<{
  page: PalInventoryPage;
  view: PalInventoryView;
  viewHrefs: Readonly<Record<PalInventoryView, string>>;
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-sm font-medium text-muted-foreground"
          aria-live="polite"
        >
          共 {page.total_count.toLocaleString("zh-CN")} 只可见帕鲁
        </p>
        <div
          className="flex items-center rounded-xl border border-border/80 bg-background/80 p-1"
          aria-label="库存展示形式"
        >
          <Link
            href={viewHrefs.cards}
            aria-current={view === "cards" ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-9 rounded-lg px-2.5",
              view === "cards" && "bg-accent text-accent-foreground shadow-xs",
            )}
          >
            <LayoutGrid aria-hidden="true" className="size-4" />
            卡片视图
          </Link>
          <Link
            href={viewHrefs.table}
            aria-current={view === "table" ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-9 rounded-lg px-2.5",
              view === "table" && "bg-accent text-accent-foreground shadow-xs",
            )}
          >
            <List aria-hidden="true" className="size-4" />
            表格视图
          </Link>
        </div>
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
      ) : view === "table" ? (
        <PalInventoryTable
          items={items}
          passiveRanks={passiveRanks}
          pendingId={pendingId}
          onToggleShare={(palInstanceUid, enabled) =>
            void toggle(palInstanceUid, enabled)
          }
        />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((pal) => (
            <PalInventoryCard
              key={pal.pal_instance_uid}
              pal={pal}
              passiveRanks={passiveRanks}
              pending={pendingId === pal.pal_instance_uid}
              onToggleShare={(palInstanceUid, enabled) =>
                void toggle(palInstanceUid, enabled)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
