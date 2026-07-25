import type { BreedingRoute } from "@palhatch/contracts";
import {
  Bot,
  Check,
  Clock3,
  GitBranch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  difficultyLabels,
  genderLabel,
  localizedName,
  localizedNames,
  optimizationModeLabels,
} from "../presentation";

export function RouteComparisonCard({
  route,
  selected,
  aiDegraded,
  palNames,
  passiveNames,
  onSelect,
}: Readonly<{
  route: BreedingRoute;
  selected: boolean;
  aiDegraded: boolean;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  onSelect: () => void;
}>) {
  const ready = route.feasibility_status === "ready";
  const accessibleName = ready
    ? `可执行路线 ${route.rank}`
    : `备选路线 ${route.rank}`;

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex h-full min-h-11 w-full min-w-0 cursor-pointer flex-col rounded-3xl border bg-white/82 p-5 text-left shadow-sm transition-[border-color,box-shadow,background-color] duration-200 outline-none motion-reduce:transition-none sm:p-6",
        "hover:border-primary/45 hover:bg-white focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35",
        selected
          ? "border-primary bg-emerald-50/82 shadow-[0_18px_44px_rgb(40_122_84_/_0.16)]"
          : "border-border",
      )}
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-bold tracking-[0.14em] text-primary uppercase">
            方案 {route.rank}
          </span>
          <span className="mt-1 block text-xl font-bold tracking-tight text-foreground">
            {optimizationModeLabels[route.optimization_mode]}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-primary text-white"
              : "border-border bg-white text-transparent",
          )}
        >
          <Check className="size-4" strokeWidth={2.5} />
        </span>
      </span>

      <span className="mt-4 flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className="border-primary/25 bg-emerald-50 text-primary"
        >
          排序第 {route.rank}
        </Badge>
        <Badge
          variant="outline"
          className={
            ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-orange-200 bg-orange-50 text-orange-800"
          }
        >
          {ready ? (
            <ShieldCheck aria-hidden="true" />
          ) : (
            <TriangleAlert aria-hidden="true" />
          )}
          {ready ? "库存可执行" : "需补库存"}
        </Badge>
        {aiDegraded ? (
          <Badge
            variant="outline"
            className="border-sky-200 bg-sky-50 text-sky-800"
          >
            <Bot aria-hidden="true" />
            降级说明
          </Badge>
        ) : null}
      </span>

      <span className="mt-5 grid grid-cols-[auto_1fr] items-end gap-3 border-b border-border pb-5">
        <span>
          <span className="block text-xs font-semibold text-muted-foreground">
            总分
          </span>
          <span className="mt-1 block text-4xl font-bold tracking-[-0.05em] text-primary tabular-nums">
            {route.total_score.toFixed(2)}
          </span>
        </span>
        <span className="justify-self-end text-right">
          <span className="block text-xs text-muted-foreground">
            策略估计难度
          </span>
          <span className="mt-1 block font-bold text-foreground">
            {difficultyLabels[route.difficulty]}
          </span>
        </span>
      </span>

      <span className="mt-5 grid grid-cols-2 gap-3">
        <Metric
          icon={GitBranch}
          label="代数"
          value={`${route.generation_count} 代`}
        />
        <Metric
          icon={Clock3}
          label="预计尝试"
          value={`${route.estimated_attempts_min}–${route.estimated_attempts_max} 次`}
        />
        <Metric
          icon={Users}
          label="公会借用"
          value={`${route.borrowed_pal_count} 只`}
        />
        <Metric
          icon={ShieldCheck}
          label="库存覆盖"
          value={`${Math.round(route.inventory_coverage * 100)}%`}
        />
        <Metric
          icon={Sparkles}
          label="词条覆盖"
          value={`${Math.round(route.inventory_passive_coverage * 100)}%`}
          className="col-span-2"
        />
      </span>

      {route.missing_requirements.length > 0 ? (
        <span className="mt-5 block rounded-2xl border border-orange-200 bg-orange-50/88 p-3 text-sm text-orange-950">
          <span className="block font-bold">
            缺少 {route.missing_pal_count} 只起始亲本
          </span>
          {route.missing_requirements.map((requirement) => (
            <span
              key={`${requirement.pal_id}:${requirement.gender}:${requirement.required_passive_ids.join(",")}`}
              className="mt-1 block leading-5"
            >
              {requirement.quantity}×{" "}
              {localizedName(palNames, requirement.pal_id, "Pal")} ·{" "}
              {genderLabel(requirement.gender)}
              {requirement.required_passive_ids.length
                ? ` · ${localizedNames(passiveNames, requirement.required_passive_ids, "被动").join("、")}`
                : " · 被动无要求"}
            </span>
          ))}
        </span>
      ) : null}

      {route.missing_passive_ids.length > 0 ? (
        <span className="mt-3 block rounded-2xl border border-amber-200 bg-amber-50/88 p-3 text-sm text-amber-950">
          <span className="block font-bold">缺少目标被动来源</span>
          <span className="mt-1 block leading-5">
            {localizedNames(
              passiveNames,
              route.missing_passive_ids,
              "被动",
            ).join("、")}
          </span>
        </span>
      ) : null}
    </button>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  className,
}: Readonly<{
  icon: typeof GitBranch;
  label: string;
  value: string;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-2 rounded-2xl bg-muted/68 p-3",
        className,
      )}
    >
      <Icon aria-hidden="true" className="row-span-2 size-4 text-primary" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 font-bold text-foreground tabular-nums">
        {value}
      </span>
    </span>
  );
}
