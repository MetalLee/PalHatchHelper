using System.Globalization;
using System.Text.Json.Nodes;

namespace PalHatchHelper.CatalogExtractor.Contracts;

public enum CatalogCategory
{
  Pals,
  PassiveSkills,
  ActiveSkills,
  PalActiveSkills,
  PartnerSkills,
  BreedingRecipes,
  Localizations,
}

public sealed record CatalogCategoryDefinition(
    CatalogCategory Category,
    string CountField,
    string FileName,
    IReadOnlyList<string> PrimaryKey);

public static class CatalogCategories
{
  public static readonly IReadOnlyList<CatalogCategoryDefinition> All =
  [
      new(CatalogCategory.Pals, "pals", "pals.jsonl", ["pal_id"]),
        new(CatalogCategory.PassiveSkills, "passive_skills", "passive-skills.jsonl", ["passive_skill_id"]),
        new(CatalogCategory.ActiveSkills, "active_skills", "active-skills.jsonl", ["active_skill_id"]),
        new(CatalogCategory.PalActiveSkills, "pal_active_skills", "pal-active-skills.jsonl", ["pal_id", "active_skill_id", "learn_level"]),
        new(CatalogCategory.PartnerSkills, "partner_skills", "partner-skills.jsonl", ["partner_skill_id"]),
        new(CatalogCategory.BreedingRecipes, "breeding_recipes", "breeding-recipes.jsonl", ["parent_a_pal_id", "parent_b_pal_id", "recipe_type"]),
        new(CatalogCategory.Localizations, "localizations", "localizations.jsonl", ["locale", "text_key"]),
    ];

  public static CatalogCategoryDefinition Definition(CatalogCategory category) => All.Single(value => value.Category == category);

  public static string RecordKey(CatalogCategory category, JsonObject record) => string.Join(
      "\0",
      Definition(category).PrimaryKey.Select(field => ScalarKey(record, field)));

  private static string ScalarKey(JsonObject record, string field)
  {
    var node = record[field] ?? throw new InvalidOperationException($"Missing primary key field {field}");
    if (node is JsonValue value)
    {
      if (value.TryGetValue<string>(out var text))
      {
        return text;
      }

      if (value.TryGetValue<int>(out var integer))
      {
        return integer.ToString("D20", CultureInfo.InvariantCulture);
      }
    }

    throw new InvalidOperationException($"Invalid primary key field {field}");
  }
}

public sealed record SourceLocation(string AssetPath, string RowName, string PropertyChain);

public sealed record SourceEvidenceRecord(
    string RecordKey,
    string SourceInternalName,
    IReadOnlyList<SourceLocation> Sources);

public sealed record ExcludedRecord(string Category, string SourceInternalName, string ReasonCode);

public sealed record UnresolvedRecord(string Category, string SourceCandidate, string ReasonCode);

public sealed record ReaderWarning(string Code, string SourceCandidate);

public sealed record SourceProvenance(
    string ExtractorRepositoryCommit,
    string ExtractorBuild,
    string SourceClientAppId,
    string SourceClientBuildId,
    string SourceClientAppmanifestSha256,
    string SourceClientGameVersion,
    string TargetServerAppId,
    string TargetServerBuildId,
    string TargetServerAppmanifestSha256,
    string TargetServerGameVersion,
    string MappingsUsmapSha256,
    string SourcePackageManifestSha256,
    DateTimeOffset ExtractedAt)
{
  public JsonObject ToJson() => new()
  {
    ["compatibility_evidence"] = new JsonArray("client_game_version_equals_target_server_game_version"),
    ["compatibility_status"] = "exact_game_version_match",
    ["cue4parse_version"] = "1.2.2.202607",
    ["extracted_at"] = ExtractedAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
    ["extraction_mode"] = "full_game_catalog",
    ["extractor_build"] = ExtractorBuild,
    ["extractor_repository_commit"] = ExtractorRepositoryCommit,
    ["mappings_usmap_sha256"] = MappingsUsmapSha256,
    ["source_client_app_id"] = SourceClientAppId,
    ["source_client_appmanifest_sha256"] = SourceClientAppmanifestSha256,
    ["source_client_build_id"] = SourceClientBuildId,
    ["source_client_game_version"] = SourceClientGameVersion,
    ["source_package_manifest_sha256"] = SourcePackageManifestSha256,
    ["target_server_app_id"] = TargetServerAppId,
    ["target_server_appmanifest_sha256"] = TargetServerAppmanifestSha256,
    ["target_server_build_id"] = TargetServerBuildId,
    ["target_server_game_version"] = TargetServerGameVersion,
    ["upstream_license"] = "MIT",
    ["upstream_reference_commit"] = "b822c7fda4f019bd7c57f45437f14a74061a29bc",
    ["upstream_reference_repository"] = "tylercamp/palcalc",
  };
}
