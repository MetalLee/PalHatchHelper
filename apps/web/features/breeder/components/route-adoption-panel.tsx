import type { BreederJobStatus, BreedingRoute } from "@palhatch/contracts";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function RouteAdoptionPanel({
  route,
  jobStatus,
  adopting,
  adoptionError,
  onAdopt,
}: Readonly<{
  route: BreedingRoute;
  jobStatus: BreederJobStatus;
  adopting: boolean;
  adoptionError: string | null;
  onAdopt: () => void;
}>) {
  return (
    <section className="min-w-0 rounded-3xl border border-primary/20 bg-emerald-50/78 p-5 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">采用当前方案</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            只有绑定真实库存实例的 ready 路线才能通过正式 RPC 创建执行计划。
          </p>
        </div>
        {route.execution_plan_id !== null ? (
          <Button asChild size="lg">
            <Link href={`/plans/${route.execution_plan_id}`}>查看执行计划</Link>
          </Button>
        ) : route.adoptable &&
          route.feasibility_status === "ready" &&
          jobStatus === "completed" ? (
          <Button type="button" size="lg" disabled={adopting} onClick={onAdopt}>
            {adopting ? "正在采用…" : "采用此方案"}
          </Button>
        ) : route.feasibility_status === "needs_inventory" ? (
          <div className="sm:text-right">
            <Button type="button" size="lg" disabled>
              需补齐库存后采用
            </Button>
            <p className="mt-2 text-xs font-semibold text-orange-800">
              补齐库存后才可采用此方案
            </p>
          </div>
        ) : (
          <Button type="button" size="lg" disabled>
            任务完成后可采用
          </Button>
        )}
      </div>
      {adoptionError === null ? null : (
        <p
          className="mt-4 break-all font-mono text-sm text-destructive"
          role="alert"
        >
          {adoptionError}
        </p>
      )}
    </section>
  );
}
