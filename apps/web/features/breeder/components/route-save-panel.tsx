"use client";

import type { BreederJobStatus, BreedingRoute } from "@palhatch/contracts";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

export function RouteSavePanel({
  route,
  jobStatus,
  saved,
  busy,
  error,
  onSave,
  onRemove,
}: Readonly<{
  route: BreedingRoute;
  jobStatus: BreederJobStatus;
  saved: boolean;
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onRemove: () => void;
}>) {
  const t = useCopy("Breeder");
  const completed = jobStatus === "completed";
  return (
    <section className="min-w-0 rounded-3xl border border-primary/20 bg-emerald-50/78 p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">
            {t("saveRouteTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("saveRouteDescription")}
          </p>
          {route.feasibility_status === "needs_inventory" ? (
            <p className="mt-2 text-xs font-semibold text-orange-800">
              {t("saveMissingDescription")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {saved ? (
            <>
              <Button asChild size="lg">
                <Link href={`/plans/${route.route_id}`}>{t("viewPlan")}</Link>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={onRemove}
              >
                {busy ? t("processingAction") : t("removeSaved")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={!completed || busy}
              onClick={onSave}
            >
              {busy
                ? t("saving")
                : completed
                  ? t("saveToPlans")
                  : t("saveAfterComplete")}
            </Button>
          )}
        </div>
      </div>
      {error === null ? null : (
        <p
          className="mt-4 break-all font-mono text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
