import type { BreederJobStatus, BreedingRoute } from "@palhatch/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";

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
  const completed = jobStatus === "completed";
  return (
    <section className="min-w-0 rounded-3xl border border-primary/20 bg-emerald-50/78 p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">收藏当前路径</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            保存后可在“我的计划”随时查看完整路线；收藏不会推进配种进度。
          </p>
          {route.feasibility_status === "needs_inventory" ? (
            <p className="mt-2 text-xs font-semibold text-orange-800">
              该路线仍需补齐库存，但可以先收藏备用。
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {saved ? (
            <>
              <Button asChild size="lg">
                <Link href={`/plans/${route.route_id}`}>查看我的计划</Link>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={onRemove}
              >
                {busy ? "正在处理…" : "移除收藏"}
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
                ? "正在保存…"
                : completed
                  ? "保存到我的计划"
                  : "任务完成后可保存"}
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
