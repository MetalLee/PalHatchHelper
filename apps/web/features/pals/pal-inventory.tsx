"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { LayoutGrid, List, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageEmpty } from "@/components/states/page-empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    <section
      id="pal-inventory-results"
      className="grid min-w-0 gap-4"
      aria-label="帕鲁库存结果"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-sm font-medium text-muted-foreground"
          aria-live="polite"
        >
          筛选结果 {page.total_count.toLocaleString("zh-CN")} 只
        </p>
        <TooltipProvider>
          <div
            className="flex items-center rounded-xl border border-border/80 bg-background/80 p-1"
            aria-label="库存展示形式"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={viewHrefs.cards}
                  aria-label="卡片视图"
                  aria-current={view === "cards" ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "size-11 rounded-lg",
                    view === "cards" &&
                      "bg-accent text-accent-foreground shadow-xs",
                  )}
                >
                  <LayoutGrid aria-hidden="true" className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top">卡片视图</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={viewHrefs.table}
                  aria-label="表格视图"
                  aria-current={view === "table" ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "size-11 rounded-lg",
                    view === "table" &&
                      "bg-accent text-accent-foreground shadow-xs",
                  )}
                >
                  <List aria-hidden="true" className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top">表格视图</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
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
