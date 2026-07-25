import type { PlanSummary } from "@palhatch/contracts";

import type { BreedingTreePassiveFact } from "@/features/breeder/lib/build-breeding-tree";

export function buildPlanPassiveNames(
  summary: PlanSummary,
): ReadonlyMap<string, string> {
  return new Map(
    summary.desired_passives.map((passive) => [
      passive.passive_skill_id,
      passive.display_name,
    ]),
  );
}

export function buildPlanPassiveFacts(
  summary: PlanSummary,
): ReadonlyMap<string, BreedingTreePassiveFact> {
  return new Map(
    summary.desired_passives.map((passive) => [
      passive.passive_skill_id,
      {
        rank: passive.rank,
        isNegative: passive.is_negative,
      },
    ]),
  );
}
