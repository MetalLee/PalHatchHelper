using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Readers;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

internal static class CatalogTraceability
{
  private static readonly Dictionary<CatalogCategory, string> EntityIdFields =
      new Dictionary<CatalogCategory, string>
      {
        [CatalogCategory.Pals] = "pal_id",
        [CatalogCategory.PassiveSkills] = "passive_skill_id",
        [CatalogCategory.ActiveSkills] = "active_skill_id",
        [CatalogCategory.PartnerSkills] = "partner_skill_id",
      };

  public static void ValidateReaderResults(IReadOnlyDictionary<CatalogCategory, ReaderResult> results)
  {
    foreach (var definition in CatalogCategories.All)
    {
      var result = results[definition.Category];
      foreach (var record in result.NormalizedRecords)
      {
        CatalogRecordSchema.Validate(definition.Category, record);
      }

      if (EntityIdFields.ContainsKey(definition.Category))
      {
        _ = StableIdV1.BuildMap(result.SourceEvidenceRecords.Select(entry => entry.SourceInternalName));
      }

      var sources = ParseEvidence(definition, result.SourceEvidenceRecords);
      ValidateRecords(definition, result.NormalizedRecords, sources);
    }
  }

  public static void ValidateRecords(
      CatalogCategoryDefinition definition,
      IReadOnlyList<JsonObject> records,
      IReadOnlyDictionary<string, string> sourceNamesByRecordKey)
  {
    var expectedKeys = records
        .Select(record => CatalogCategories.RecordKey(definition.Category, record))
        .ToHashSet(StringComparer.Ordinal);
    if (!expectedKeys.SetEquals(sourceNamesByRecordKey.Keys))
    {
      throw Invalid(definition.CountField);
    }

    if (definition.Category == CatalogCategory.Localizations)
    {
      return;
    }

    var sourceNames = new List<string>(records.Count);
    foreach (var record in records)
    {
      var recordKey = CatalogCategories.RecordKey(definition.Category, record);
      var metadataSourceNode = record["metadata"]?["source_internal_name"];
      if (metadataSourceNode is not JsonValue metadataSourceValue
          || !metadataSourceValue.TryGetValue<string>(out var metadataSource)
          || string.IsNullOrWhiteSpace(metadataSource)
          || !StringComparer.Ordinal.Equals(metadataSource, sourceNamesByRecordKey[recordKey]))
      {
        throw Invalid(definition.CountField);
      }

      sourceNames.Add(metadataSource);
    }

    if (!EntityIdFields.TryGetValue(definition.Category, out var idField))
    {
      return;
    }

    var stableIds = StableIdV1.BuildMap(sourceNames);
    foreach (var record in records)
    {
      var source = record["metadata"]!["source_internal_name"]!.GetValue<string>();
      if (!StringComparer.Ordinal.Equals(record[idField]!.GetValue<string>(), stableIds[source]))
      {
        throw Invalid(definition.CountField);
      }
    }
  }

  private static Dictionary<string, string> ParseEvidence(
      CatalogCategoryDefinition definition,
      IReadOnlyList<SourceEvidenceRecord> entries)
  {
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var entry in entries)
    {
      if (string.IsNullOrWhiteSpace(entry.RecordKey)
          || string.IsNullOrWhiteSpace(entry.SourceInternalName)
          || entry.Sources.Count == 0
          || entry.Sources.Any(source => string.IsNullOrWhiteSpace(source.AssetPath)
              || string.IsNullOrWhiteSpace(source.RowName)
              || string.IsNullOrWhiteSpace(source.PropertyChain))
          || !result.TryAdd(entry.RecordKey, entry.SourceInternalName))
      {
        throw Invalid(definition.CountField);
      }
    }

    return result;
  }

  private static ExtractorException Invalid(string category) => new(
      ErrorCodes.CatalogSourceEvidenceInvalid,
      $"Stable-ID source metadata and reverse evidence are invalid: {category}");
}
