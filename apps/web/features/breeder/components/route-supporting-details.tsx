"use client";

import type { BreedingRoute } from "@palhatch/contracts";

import { GenderDisplay } from "@/components/pals/gender-display";
import { useCopy } from "@/i18n/client";

import { localizedName, localizedNames } from "../presentation";

export function RouteMissingRequirements({
  route,
  palNames,
  passiveNames,
}: Readonly<{
  route: BreedingRoute;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
}>) {
  const t = useCopy("Breeder");
  const genderText = (
    gender: BreedingRoute["missing_requirements"][number]["gender"],
  ): string =>
    t(
      gender === "male"
        ? "male"
        : gender === "female"
          ? "female"
          : gender === "genderless"
            ? "genderless"
            : "unknownGender",
    );
  if (
    route.missing_requirements.length === 0 &&
    route.missing_passive_ids.length === 0
  ) {
    return null;
  }
  return (
    <section
      className="rounded-3xl border border-orange-200 bg-orange-50/88 p-5"
      aria-label={t("missingRequirementsLabel")}
    >
      <h2 className="font-bold text-orange-950">
        {t("stillNeedPals", { count: route.missing_pal_count })}
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
                {localizedName(
                  palNames,
                  requirement.pal_id,
                  t("targetFallback"),
                )}{" "}
                ·
              </span>
              <GenderDisplay
                gender={requirement.gender}
                label={genderText(requirement.gender)}
              />
              <span>
                {requirement.required_passive_ids.length
                  ? t("requirementPassives", {
                      names: localizedNames(
                        passiveNames,
                        requirement.required_passive_ids,
                        t("passiveFallback"),
                      ).join(", "),
                    })
                  : t("noPassiveRequirement")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {route.missing_passive_ids.length > 0 ? (
        <p className="mt-3 text-sm text-amber-950">
          {t("missingPassiveSourcesShort", {
            names: localizedNames(
              passiveNames,
              route.missing_passive_ids,
              t("passiveFallback"),
            ).join(", "),
          })}
        </p>
      ) : null}
    </section>
  );
}
