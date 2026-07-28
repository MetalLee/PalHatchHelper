"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PageEmpty } from "@/components/states/page-empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppLocale, useCopy } from "@/i18n/client";
import { catalogLocaleFor } from "@/i18n/routing";

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
  passiveRanks = {},
  onToggleShare,
}: Readonly<{
  page: PalInventoryPage;
  view: PalInventoryView;
  passiveRanks?: Readonly<Record<string, number>>;
  onToggleShare?: ToggleShare;
}>) {
  const locale = useAppLocale();
  const t = useCopy("Pals");
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
      aria-label={t("resultsLabel")}
    >
      <p
        className="text-sm font-medium text-muted-foreground"
        aria-live="polite"
      >
        {t("filterResults", {
          count: page.total_count.toLocaleString(catalogLocaleFor(locale)),
        })}
      </p>

      {errorCode !== null ? (
        <Alert
          variant="destructive"
          role="alert"
          className="rounded-2xl border-rose-200 bg-rose-50 text-rose-900"
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          <AlertTitle>{t("shareUpdateTitle")}</AlertTitle>
          <AlertDescription className="text-rose-800">
            {errorCode === "PAL_NOT_OWNED" ? t("onlyOwner") : t("updateKeep")}
          </AlertDescription>
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <PageEmpty
          title={t("emptyTitle")}
          description={t("emptyDescription")}
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
