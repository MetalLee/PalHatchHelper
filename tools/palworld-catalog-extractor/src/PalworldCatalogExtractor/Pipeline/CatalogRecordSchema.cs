using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

internal static class CatalogRecordSchema
{
  private static readonly Dictionary<CatalogCategory, string> Definitions =
      new Dictionary<CatalogCategory, string>
      {
        [CatalogCategory.Pals] = "CatalogPal",
        [CatalogCategory.PassiveSkills] = "CatalogPassiveSkill",
        [CatalogCategory.ActiveSkills] = "CatalogActiveSkill",
        [CatalogCategory.PalActiveSkills] = "CatalogPalActiveSkill",
        [CatalogCategory.PartnerSkills] = "CatalogPartnerSkill",
        [CatalogCategory.BreedingRecipes] = "CatalogBreedingRecipe",
        [CatalogCategory.Localizations] = "CatalogLocalization",
      };

  private static readonly Dictionary<CatalogCategory, string[]> StableIdFields =
      new Dictionary<CatalogCategory, string[]>
      {
        [CatalogCategory.Pals] = ["pal_id"],
        [CatalogCategory.PassiveSkills] = ["passive_skill_id"],
        [CatalogCategory.ActiveSkills] = ["active_skill_id", "element_type"],
        [CatalogCategory.PalActiveSkills] = ["pal_id", "active_skill_id"],
        [CatalogCategory.PartnerSkills] = ["partner_skill_id", "pal_id"],
        [CatalogCategory.BreedingRecipes] = ["parent_a_pal_id", "parent_b_pal_id", "child_pal_id"],
        [CatalogCategory.Localizations] = [],
      };

  public static void Validate(CatalogCategory category, JsonObject record)
  {
    SharedCatalogSchemaValidator.ValidateDefinition(record, Definitions[category]);
    foreach (var field in StableIdFields[category])
    {
      var value = record[field]!.GetValue<string>();
      if (!StringComparer.Ordinal.Equals(StableIdV1.Normalize(value), value))
      {
        throw Invalid(field);
      }
    }

    if (category == CatalogCategory.Pals)
    {
      ValidateSortedStableIdSet(record["element_types"]!.AsArray(), "element_types");
    }

    if (category == CatalogCategory.BreedingRecipes
        && StringComparer.Ordinal.Compare(
            record["parent_a_pal_id"]!.GetValue<string>(),
            record["parent_b_pal_id"]!.GetValue<string>()) > 0)
    {
      throw new ExtractorException(
          ErrorCodes.CatalogOrderInvalid,
          "Breeding recipe parents are not in canonical stable-ID order.");
    }
  }

  private static void ValidateSortedStableIdSet(JsonArray values, string field)
  {
    string? previous = null;
    foreach (var item in values)
    {
      var value = item!.GetValue<string>();
      if (!StringComparer.Ordinal.Equals(StableIdV1.Normalize(value), value)
          || previous is not null && StringComparer.Ordinal.Compare(previous, value) >= 0)
      {
        throw new ExtractorException(
            ErrorCodes.CatalogOrderInvalid,
            $"A set-semantic catalog array is not sorted: {field}");
      }

      previous = value;
    }
  }

  private static ExtractorException Invalid(string context) => new(
      ErrorCodes.CatalogSchemaInvalid,
      $"A normalized record does not satisfy the shared Catalog Schema: {context}");
}
