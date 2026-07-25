"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { ShieldCheck, Warehouse } from "lucide-react";
import { useState } from "react";

import { PageEmpty } from "@/components/states/page-empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { PalInventoryCard } from "./pal-inventory-card";

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
