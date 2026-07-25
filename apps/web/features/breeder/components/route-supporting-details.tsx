import type { BreedingRoute } from "@palhatch/contracts";
import { Bot, Sparkles } from "lucide-react";

import { StatusChip } from "@/components/status/status-chip";

import {
  compactIdentifier,
  genderLabel,
  localizedName,
  localizedNames,
} from "../presentation";

export function RouteExplanation({
  route,
  planExplanation,
  degraded,
}: Readonly<{
  route: BreedingRoute;
  planExplanation: string | null;
  degraded: boolean;
}>) {
  return (
    <section className="min-w-0 rounded-3xl border border-sky-200 bg-sky-50/84 p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-sky-800 shadow-sm">
          <Bot aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-sky-950">
              AI 辅助解释（不改变确定性事实）
            </h2>
            {degraded ? (
              <StatusChip tone="neutral">当前使用降级说明</StatusChip>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-7 text-sky-950">
            {route.ai_explanation ?? planExplanation ?? "暂无解释"}
          </p>
          {route.ai_labels.length > 0 ? (
            <p className="mt-2 text-xs text-sky-800">
              标签：{route.ai_labels.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function RouteMissingRequirements({
  route,
  palNames,
  passiveNames,
}: Readonly<{
  route: BreedingRoute;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  if (
    route.missing_requirements.length === 0 &&
    route.missing_passive_ids.length === 0
  ) {
    return null;
  }
  return (
    <section
      className="rounded-3xl border border-orange-200 bg-orange-50/88 p-5"
      aria-label="仍缺少的 Pal"
    >
      <h2 className="font-bold text-orange-950">
        仍需准备 {route.missing_pal_count} 只 Pal
      </h2>
      {route.missing_requirements.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm text-orange-950">
          {route.missing_requirements.map((requirement) => (
            <li
              key={`${requirement.pal_id}:${requirement.gender}:${requirement.required_passive_ids.join(",")}`}
            >
              {requirement.quantity}×{" "}
              {localizedName(palNames, requirement.pal_id, "Pal")} ·{" "}
              {genderLabel(requirement.gender)}
              {requirement.required_passive_ids.length
                ? ` · 被动 ${localizedNames(passiveNames, requirement.required_passive_ids, "被动").join("、")}`
                : " · 被动无要求"}
            </li>
          ))}
        </ul>
      ) : null}
      {route.missing_passive_ids.length > 0 ? (
        <p className="mt-3 text-sm text-amber-950">
          缺少被动来源：
          {localizedNames(passiveNames, route.missing_passive_ids, "被动").join(
            "、",
          )}
        </p>
      ) : null}
    </section>
  );
}

export function RoutePassiveSources({
  route,
  historical,
  palNames,
  passiveNames,
}: Readonly<{
  route: BreedingRoute;
  historical: boolean;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  return (
    <section
      className="min-w-0 rounded-3xl border border-border bg-white/76 p-5"
      aria-label="词条来源"
    >
      <h2 className="flex items-center gap-2 font-bold text-foreground">
        <Sparkles aria-hidden="true" className="size-4 text-primary" />
        词条来源
      </h2>
      {route.passive_sources.length > 0 ? (
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          {route.passive_sources.map((source) => (
            <div
              className="min-w-0 rounded-2xl border border-border bg-white/78 p-3"
              key={source.passive_id}
            >
              <h3 className="font-semibold text-foreground">
                {localizedName(passiveNames, source.passive_id, "被动")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                库存 {localizedName(palNames, source.source_pal_id, "Pal")} ·
                实例 {compactIdentifier(source.source_instance_uid)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                首次保留于步骤 {source.first_required_step_index + 1}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {historical
            ? "历史结果未记录词条来源；兼容投影不会改写原路线。"
            : "此路线没有已追踪的目标被动来源。"}
        </p>
      )}
    </section>
  );
}
