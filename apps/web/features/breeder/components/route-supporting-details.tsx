import type { BreedingRoute } from "@palhatch/contracts";

import { GenderDisplay } from "@/components/pals/gender-display";

import { genderLabel, localizedName, localizedNames } from "../presentation";

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
      aria-label="仍缺少的帕鲁"
    >
      <h2 className="font-bold text-orange-950">
        仍需准备 {route.missing_pal_count} 只帕鲁
      </h2>
      {route.missing_requirements.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm text-orange-950">
          {route.missing_requirements.map((requirement) => (
            <li
              key={`${requirement.pal_id}:${requirement.gender}:${requirement.required_passive_ids.join(",")}`}
              className="flex flex-wrap items-center gap-x-1 gap-y-0.5"
            >
              <span>
                {requirement.quantity}×{" "}
                {localizedName(palNames, requirement.pal_id, "帕鲁")} ·
              </span>
              <GenderDisplay
                gender={requirement.gender}
                label={genderLabel(requirement.gender)}
              />
              <span>
                {requirement.required_passive_ids.length
                  ? ` · 被动 ${localizedNames(passiveNames, requirement.required_passive_ids, "被动").join("、")}`
                  : " · 被动无要求"}
              </span>
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
