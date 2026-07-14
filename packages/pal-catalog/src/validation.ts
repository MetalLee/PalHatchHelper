import type {
  CatalogActiveSkill,
  CatalogBreedingRecipe,
  CatalogLocalization,
  CatalogPal,
  CatalogPalActiveSkill,
  CatalogPartnerSkill,
  CatalogPassiveSkill,
} from "@palhatch/contracts";

export interface CatalogRecords {
  readonly pals: readonly CatalogPal[];
  readonly passiveSkills: readonly CatalogPassiveSkill[];
  readonly activeSkills: readonly CatalogActiveSkill[];
  readonly palActiveSkills: readonly CatalogPalActiveSkill[];
  readonly partnerSkills: readonly CatalogPartnerSkill[];
  readonly breedingRecipes: readonly CatalogBreedingRecipe[];
  readonly localizations: readonly CatalogLocalization[];
}

export function validateCatalogRelationships(
  catalog: CatalogRecords,
): readonly string[] {
  const errors = new Set<string>();
  const palIds = uniqueIds(
    catalog.pals.map((record) => record.pal_id),
    errors,
  );
  uniqueIds(
    catalog.passiveSkills.map((record) => record.passive_skill_id),
    errors,
  );
  const activeSkillIds = uniqueIds(
    catalog.activeSkills.map((record) => record.active_skill_id),
    errors,
  );
  uniqueIds(
    catalog.partnerSkills.map((record) => record.partner_skill_id),
    errors,
  );
  uniqueIds(
    catalog.localizations.map(
      (record) => `${record.locale}\0${record.text_key}`,
    ),
    errors,
  );

  for (const relation of catalog.palActiveSkills) {
    if (
      !palIds.has(relation.pal_id) ||
      !activeSkillIds.has(relation.active_skill_id)
    ) {
      errors.add("CATALOG_REFERENCE_INVALID");
    }
  }
  for (const skill of catalog.partnerSkills) {
    if (!palIds.has(skill.pal_id)) errors.add("CATALOG_REFERENCE_INVALID");
  }
  for (const recipe of catalog.breedingRecipes) {
    if (
      !palIds.has(recipe.parent_a_pal_id) ||
      !palIds.has(recipe.parent_b_pal_id) ||
      !palIds.has(recipe.child_pal_id)
    ) {
      errors.add("CATALOG_REFERENCE_INVALID");
    }
    if (recipe.parent_a_pal_id > recipe.parent_b_pal_id) {
      errors.add("CATALOG_PARENT_ORDER_INVALID");
    }
  }
  uniqueIds(
    catalog.breedingRecipes.map(
      (recipe) =>
        `${recipe.parent_a_pal_id}\0${recipe.parent_b_pal_id}\0${recipe.recipe_type}`,
    ),
    errors,
  );
  return [...errors].sort();
}

function uniqueIds(
  values: readonly string[],
  errors: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value)) errors.add("CATALOG_DUPLICATE_ID");
    ids.add(value);
  }
  return ids;
}
