import type {
  BreederCatalogPalOption,
  CreateBreedingJobRequest,
} from "@palhatch/contracts";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { optimizationModeLabel } from "./optimization-mode-picker";

export function BreederSubmitSummary({
  target,
  passiveCount,
  mode,
  allowShared,
  disabled,
  submitting,
}: Readonly<{
  target: BreederCatalogPalOption | undefined;
  passiveCount: number;
  mode: CreateBreedingJobRequest["optimization_mode"];
  allowShared: boolean;
  disabled: boolean;
  submitting: boolean;
}>) {
  const facts = [
    ["当前目标", target?.display_name ?? "尚未选择"],
    ["已选被动", `${passiveCount} / 4`],
    ["优化模式", optimizationModeLabel(mode)],
    ["公会共享", allowShared ? "允许" : "不允许"],
  ] as const;

  return (
    <section className="min-w-0 rounded-3xl border border-primary/20 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(223,245,231,0.78))] p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
        <h2 className="font-bold text-foreground">创建前确认</h2>
      </div>
      <dl className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-white/62 p-3">
            <dt className="text-xs font-semibold text-muted-foreground">
              {label}
            </dt>
            <dd
              className="mt-1 truncate font-bold text-foreground"
              title={value}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <Button
        type="submit"
        size="lg"
        disabled={disabled}
        className="mt-4 w-full rounded-xl shadow-sm"
      >
        {submitting ? "正在创建…" : "创建配种任务"}
        {submitting ? null : (
          <ArrowRight aria-hidden="true" className="size-4" />
        )}
      </Button>
      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
        创建后会跳转到任务页，按真实计算阶段展示进度。
      </p>
    </section>
  );
}
