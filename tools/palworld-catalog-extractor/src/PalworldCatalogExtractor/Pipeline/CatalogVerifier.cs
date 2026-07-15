using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

public static class CatalogVerifier
{
  public static JsonObject Verify(string directory)
  {
    var manifest = ReadObject(Path.Combine(directory, "manifest.json"), ErrorCodes.CatalogFileMissing);
    var sourceManifest = ReadObject(Path.Combine(directory, "source-package-manifest.json"), ErrorCodes.CatalogFileMissing);
    var records = new Dictionary<CatalogCategory, JsonObject[]>();
    var hashes = new List<CatalogFileHash>();
    foreach (var definition in CatalogCategories.All)
    {
      var path = Path.Combine(directory, definition.FileName);
      if (!File.Exists(path))
      {
        throw new ExtractorException(ErrorCodes.CatalogFileMissing, $"Required catalog file is missing: {definition.FileName}");
      }

      var parsed = File.ReadLines(path).Select(ParseRecord).ToArray();
      if (parsed.Length == 0)
      {
        throw new ExtractorException(ErrorCodes.FullCatalogCategoryEmpty, $"Catalog category is empty: {definition.CountField}");
      }

      ValidateKeys(definition, parsed);
      records.Add(definition.Category, parsed);
      hashes.Add(new CatalogFileHash(definition.FileName, Hashing.Sha256File(path), parsed.Length));
    }

    ValidateManifest(manifest, sourceManifest, hashes);
    ValidateRelationships(records);
    ValidateEvidence(directory, records);
    return BuildReport(records, Hashing.ComputeContentHash(hashes));
  }

  private static JsonObject ReadObject(string path, string missingCode)
  {
    if (!File.Exists(path))
    {
      throw new ExtractorException(missingCode, $"Required file is missing: {Path.GetFileName(path)}");
    }

    try
    {
      return JsonNode.Parse(File.ReadAllText(path))?.AsObject()
          ?? throw new InvalidDataException("Expected object");
    }
    catch (Exception error) when (error is System.Text.Json.JsonException or InvalidOperationException or InvalidDataException)
    {
      throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, $"Invalid JSON object: {Path.GetFileName(path)}");
    }
  }

  private static JsonObject ParseRecord(string line)
  {
    try
    {
      return JsonNode.Parse(line)?.AsObject() ?? throw new InvalidDataException("Expected object");
    }
    catch (Exception error) when (error is System.Text.Json.JsonException or InvalidOperationException or InvalidDataException)
    {
      throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, "A normalized JSONL record is invalid.");
    }
  }

  private static void ValidateKeys(CatalogCategoryDefinition definition, IReadOnlyList<JsonObject> records)
  {
    string? previous = null;
    var seen = new HashSet<string>(StringComparer.Ordinal);
    foreach (var record in records)
    {
      CatalogRecordSchema.Validate(definition.Category, record);
      string key;
      try
      {
        key = CatalogCategories.RecordKey(definition.Category, record);
      }
      catch (InvalidOperationException)
      {
        throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, $"Invalid primary key in {definition.FileName}.");
      }

      if (!seen.Add(key))
      {
        throw new ExtractorException(ErrorCodes.CatalogDuplicateId, $"Duplicate record key in {definition.FileName}.");
      }

      if (previous is not null && StringComparer.Ordinal.Compare(previous, key) > 0)
      {
        throw new ExtractorException(ErrorCodes.CatalogOrderInvalid, $"Records are not sorted in {definition.FileName}.");
      }

      previous = key;
      foreach (var idField in definition.PrimaryKey.Where(field => field.EndsWith("_id", StringComparison.Ordinal)))
      {
        var stableId = record[idField]?.GetValue<string>()
            ?? throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, $"Missing stable ID field {idField}.");
        if (!StringComparer.Ordinal.Equals(StableIdV1.Normalize(stableId), stableId))
        {
          throw new ExtractorException(ErrorCodes.GameIdInvalid, $"A catalog ID is not normalized in {definition.FileName}.");
        }
      }
    }
  }

  private static void ValidateManifest(JsonObject manifest, JsonObject sourceManifest, IReadOnlyList<CatalogFileHash> hashes)
  {
    var contentHash = Hashing.ComputeContentHash(hashes);
    var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
    if (manifest["schema_version"]?.GetValue<string>() != "1.1.0"
        || manifest["extractor_name"]?.GetValue<string>() != "palhatch-full-catalog-extractor"
        || manifest["content_hash"]?.GetValue<string>() != contentHash
        || manifest["package_hash"]?.GetValue<string>() != packageHash)
    {
      throw new ExtractorException(ErrorCodes.CatalogHashMismatch, "Manifest hashes or 1.1.0 identity are invalid.");
    }

    var provenance = manifest["source_provenance"]?.AsObject()
        ?? throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, "Catalog 1.1.0 requires source_provenance.");
    if (provenance["compatibility_status"]?.GetValue<string>() != "exact_game_version_match"
        || provenance["source_client_game_version"]?.GetValue<string>() != provenance["target_server_game_version"]?.GetValue<string>()
        || provenance["target_server_build_id"]?.GetValue<string>() != manifest["game_build_id"]?.GetValue<string>()
        || provenance["source_package_manifest_sha256"]?.GetValue<string>() != packageHash)
    {
      throw new ExtractorException(ErrorCodes.GameVersionMismatch, "Client/server provenance is not an exact game-version match.");
    }

    var expected = hashes.ToDictionary(value => value.FileName, StringComparer.Ordinal);
    var listed = manifest["files"]?.AsArray() ?? throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, "Manifest files are missing.");
    if (listed.Count != CatalogCategories.All.Count)
    {
      throw new ExtractorException(ErrorCodes.CatalogFileMissing, "Manifest must list exactly seven normalized files.");
    }

    foreach (var item in listed.Select(value => value!.AsObject()))
    {
      var filename = item["filename"]!.GetValue<string>();
      if (!expected.TryGetValue(filename, out var actual)
          || item["sha256"]?.GetValue<string>() != actual.Sha256
          || item["record_count"]?.GetValue<int>() != actual.RecordCount)
      {
        throw new ExtractorException(ErrorCodes.CatalogHashMismatch, $"Manifest checksum mismatch: {filename}");
      }
    }
  }

  private static void ValidateRelationships(Dictionary<CatalogCategory, JsonObject[]> records)
  {
    var pals = Set(records[CatalogCategory.Pals], "pal_id");
    var active = Set(records[CatalogCategory.ActiveSkills], "active_skill_id");
    var localized = Set(records[CatalogCategory.Localizations], "text_key");
    if (records[CatalogCategory.PalActiveSkills].Any(record => !pals.Contains(Text(record, "pal_id")) || !active.Contains(Text(record, "active_skill_id")))
        || records[CatalogCategory.PartnerSkills].Any(record => !pals.Contains(Text(record, "pal_id")))
        || records[CatalogCategory.BreedingRecipes].Any(record =>
            !pals.Contains(Text(record, "parent_a_pal_id"))
            || !pals.Contains(Text(record, "parent_b_pal_id"))
            || !pals.Contains(Text(record, "child_pal_id"))))
    {
      throw new ExtractorException(ErrorCodes.CatalogReferenceInvalid, "A normalized record references a missing catalog ID.");
    }

    var localizationFields = new[] { "name_key", "description_key" };
    var missing = records.Where(pair => pair.Key is CatalogCategory.Pals or CatalogCategory.PassiveSkills or CatalogCategory.ActiveSkills or CatalogCategory.PartnerSkills)
        .SelectMany(pair => pair.Value)
        .SelectMany(record => localizationFields.Select(field => record[field]))
        .Where(value => value is not null)
        .Select(value => value!.GetValue<string>())
        .Any(value => !localized.Contains(value));
    if (missing)
    {
      throw new ExtractorException(ErrorCodes.CatalogLocalizationReferenceInvalid, "A normalized record references missing localization text.");
    }
  }

  private static void ValidateEvidence(string directory, Dictionary<CatalogCategory, JsonObject[]> records)
  {
    var evidence = ReadObject(Path.Combine(directory, "source-evidence.json"), ErrorCodes.CatalogFileMissing);
    var categories = evidence["categories"]?.AsObject()
        ?? throw new ExtractorException(ErrorCodes.CatalogSourceEvidenceInvalid, "Source evidence categories are missing.");
    foreach (var definition in CatalogCategories.All)
    {
      var entries = categories[definition.CountField]?.AsArray();
      var expectedKeys = records[definition.Category]
          .Select(record => CatalogCategories.RecordKey(definition.Category, record))
          .ToHashSet(StringComparer.Ordinal);
      if (entries is null || entries.Count != expectedKeys.Count)
      {
        throw new ExtractorException(ErrorCodes.CatalogSourceEvidenceInvalid, $"Reverse source evidence is incomplete: {definition.CountField}");
      }

      var actualKeys = new HashSet<string>(StringComparer.Ordinal);
      foreach (var entryNode in entries)
      {
        if (entryNode is not JsonObject entry
            || !TryNonEmptyText(entry["record_key"], out var recordKey)
            || !TryNonEmptyText(entry["source_internal_name"], out _)
            || entry["sources"] is not JsonArray sources
            || sources.Count == 0
            || sources.Any(source => source is not JsonObject location
                || !TryNonEmptyText(location["asset_path"], out _)
                || !TryNonEmptyText(location["row_name"], out _)
                || !TryNonEmptyText(location["property_chain"], out _))
            || !actualKeys.Add(recordKey))
        {
          throw new ExtractorException(ErrorCodes.CatalogSourceEvidenceInvalid, $"Reverse source evidence is invalid: {definition.CountField}");
        }
      }

      if (!actualKeys.SetEquals(expectedKeys))
      {
        throw new ExtractorException(ErrorCodes.CatalogSourceEvidenceInvalid, $"Reverse source evidence keys do not match: {definition.CountField}");
      }
    }
  }

  private static bool TryNonEmptyText(JsonNode? node, out string value)
  {
    value = string.Empty;
    if (node is JsonValue jsonValue
        && jsonValue.TryGetValue<string>(out var text)
        && !string.IsNullOrWhiteSpace(text))
    {
      value = text;
      return true;
    }

    return false;
  }

  private static HashSet<string> Set(IEnumerable<JsonObject> records, string field) =>
      records.Select(record => Text(record, field)).ToHashSet(StringComparer.Ordinal);

  private static string Text(JsonObject record, string field) => record[field]?.GetValue<string>()
      ?? throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, $"Missing string field: {field}");

  private static JsonObject BuildReport(Dictionary<CatalogCategory, JsonObject[]> records, string contentHash)
  {
    var counts = new JsonObject();
    foreach (var definition in CatalogCategories.All)
    {
      counts[definition.CountField] = records[definition.Category].Length;
    }

    return new JsonObject
    {
      ["content_hash"] = contentHash,
      ["counts"] = counts,
      ["errors"] = new JsonArray(),
      ["schema_version"] = "1.1.0",
      ["valid"] = true,
      ["warnings"] = new JsonArray(),
    };
  }
}
