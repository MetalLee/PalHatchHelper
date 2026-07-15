using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

public static class CatalogVerifier
{
  public static JsonObject Verify(string directory) => VerifyCore(directory, requireValidationReport: true);

  public static JsonObject Verify(string directory, string comparisonDirectory)
  {
    if (StringComparer.OrdinalIgnoreCase.Equals(
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory)),
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(comparisonDirectory))))
    {
      throw new ExtractorException(
          ErrorCodes.CatalogReproducibilityMismatch,
          "Reproducibility verification requires two distinct extraction directories.");
    }

    var report = Verify(directory);
    _ = Verify(comparisonDirectory);
    var firstManifest = ReadObject(Path.Combine(directory, "manifest.json"), ErrorCodes.CatalogFileMissing);
    var secondManifest = ReadObject(Path.Combine(comparisonDirectory, "manifest.json"), ErrorCodes.CatalogFileMissing);
    var sameSource = firstManifest["package_hash"]?.GetValue<string>()
        == secondManifest["package_hash"]?.GetValue<string>();
    var sameContent = firstManifest["content_hash"]?.GetValue<string>()
        == secondManifest["content_hash"]?.GetValue<string>();
    var sameNormalizedFiles = CatalogCategories.All.All(definition =>
        File.ReadAllBytes(Path.Combine(directory, definition.FileName))
            .AsSpan()
            .SequenceEqual(File.ReadAllBytes(Path.Combine(comparisonDirectory, definition.FileName))));
    if (!sameSource || !sameContent || !sameNormalizedFiles)
    {
      throw new ExtractorException(
          ErrorCodes.CatalogReproducibilityMismatch,
          "Independent extractions of the same source are not byte-for-byte reproducible.");
    }

    report["reproducibility_status"] = "identical";
    return report;
  }

  internal static JsonObject VerifyForExtraction(string directory) =>
      VerifyCore(directory, requireValidationReport: false);

  private static JsonObject VerifyCore(string directory, bool requireValidationReport)
  {
    var manifest = ReadObject(Path.Combine(directory, "manifest.json"), ErrorCodes.CatalogFileMissing);
    SharedCatalogSchemaValidator.ValidateManifest(manifest);
    var sourceManifest = ReadObject(
        Path.Combine(directory, "source-package-manifest.json"),
        ErrorCodes.CatalogFileMissing);
    ValidateSourcePackageManifest(sourceManifest);

    var records = new Dictionary<CatalogCategory, JsonObject[]>();
    var hashes = new List<CatalogFileHash>();
    foreach (var definition in CatalogCategories.All)
    {
      var path = Path.Combine(directory, definition.FileName);
      if (!File.Exists(path))
      {
        throw new ExtractorException(
            ErrorCodes.CatalogFileMissing,
            $"Required catalog file is missing: {definition.FileName}");
      }

      var parsed = File.ReadLines(path).Select(ParseRecord).ToArray();
      if (parsed.Length == 0)
      {
        throw new ExtractorException(
            ErrorCodes.FullCatalogCategoryEmpty,
            $"Catalog category is empty: {definition.CountField}");
      }

      ValidateKeys(definition, parsed);
      records.Add(definition.Category, parsed);
      hashes.Add(new CatalogFileHash(definition.FileName, Hashing.Sha256File(path), parsed.Length));
    }

    var contentHash = Hashing.ComputeContentHash(hashes);
    var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
    ValidateManifest(manifest, records, hashes, contentHash, packageHash);
    ValidateRelationships(records);
    ValidateEvidence(directory, records);
    ValidateChecksums(directory, hashes);
    ValidateSummary(directory, contentHash, packageHash);
    var report = BuildReport(records, contentHash);
    if (requireValidationReport)
    {
      ValidateReport(directory, report);
    }

    return report;
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
      throw new ExtractorException(
          ErrorCodes.CatalogSchemaInvalid,
          $"Invalid JSON object: {Path.GetFileName(path)}");
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
        throw new ExtractorException(
            ErrorCodes.CatalogSchemaInvalid,
            $"Invalid primary key in {definition.FileName}.");
      }

      if (!seen.Add(key))
      {
        throw new ExtractorException(
            ErrorCodes.CatalogDuplicateId,
            $"Duplicate record key in {definition.FileName}.");
      }

      if (previous is not null && StringComparer.Ordinal.Compare(previous, key) > 0)
      {
        throw new ExtractorException(
            ErrorCodes.CatalogOrderInvalid,
            $"Records are not sorted in {definition.FileName}.");
      }

      previous = key;
    }
  }

  private static void ValidateManifest(
      JsonObject manifest,
      Dictionary<CatalogCategory, JsonObject[]> records,
      IReadOnlyList<CatalogFileHash> hashes,
      string contentHash,
      string packageHash)
  {
    if (manifest["schema_version"]?.GetValue<string>() != "1.1.0")
    {
      throw new ExtractorException(
          ErrorCodes.CatalogSchemaInvalid,
          "The full-catalog extractor only verifies Catalog Schema 1.1.0 outputs.");
    }

    if (manifest["content_hash"]?.GetValue<string>() != contentHash
        || manifest["package_hash"]?.GetValue<string>() != packageHash)
    {
      throw new ExtractorException(ErrorCodes.CatalogHashMismatch, "Manifest content or package hash is invalid.");
    }

    var provenance = manifest["source_provenance"]!.AsObject();
    if (provenance["compatibility_status"]?.GetValue<string>() != "exact_game_version_match"
        || provenance["source_client_game_version"]?.GetValue<string>()
            != provenance["target_server_game_version"]?.GetValue<string>()
        || provenance["target_server_build_id"]?.GetValue<string>()
            != manifest["game_build_id"]?.GetValue<string>()
        || provenance["target_server_game_version"]?.GetValue<string>()
            != manifest["game_version"]?.GetValue<string>()
        || provenance["source_package_manifest_sha256"]?.GetValue<string>() != packageHash)
    {
      throw new ExtractorException(
          ErrorCodes.SourceGameVersionMismatch,
          "Client/server provenance is not an exact game-version match.");
    }

    var expected = hashes.ToDictionary(value => value.FileName, StringComparer.Ordinal);
    var listed = manifest["files"]!.AsArray();
    var listedNames = new HashSet<string>(StringComparer.Ordinal);
    string? previousFilename = null;
    foreach (var item in listed.Select(value => value!.AsObject()))
    {
      var filename = item["filename"]!.GetValue<string>();
      if (!listedNames.Add(filename)
          || previousFilename is not null && StringComparer.Ordinal.Compare(previousFilename, filename) > 0
          || !expected.TryGetValue(filename, out var actual)
          || item["sha256"]!.GetValue<string>() != actual.Sha256
          || item["record_count"]!.GetValue<int>() != actual.RecordCount)
      {
        throw new ExtractorException(ErrorCodes.CatalogHashMismatch, $"Manifest file entry is invalid: {filename}");
      }

      previousFilename = filename;
    }

    if (!listedNames.SetEquals(expected.Keys))
    {
      throw new ExtractorException(
          ErrorCodes.CatalogFileMissing,
          "Manifest must list exactly the seven normalized files.");
    }

    var counts = manifest["counts"]!.AsObject();
    foreach (var definition in CatalogCategories.All)
    {
      if (counts[definition.CountField]!.GetValue<int>() != records[definition.Category].Length)
      {
        throw new ExtractorException(
            ErrorCodes.CatalogHashMismatch,
            $"Manifest category count is invalid: {definition.CountField}");
      }
    }

    var locales = manifest["locales"]!.AsArray().Select(value => value!.GetValue<string>()).ToArray();
    var actualLocales = records[CatalogCategory.Localizations]
        .Select(record => Text(record, "locale"))
        .Distinct(StringComparer.Ordinal)
        .Order(StringComparer.Ordinal)
        .ToArray();
    if (!locales.SequenceEqual(locales.Order(StringComparer.Ordinal), StringComparer.Ordinal)
        || !locales.SequenceEqual(actualLocales, StringComparer.Ordinal))
    {
      throw new ExtractorException(
          ErrorCodes.CatalogLocalizationReferenceInvalid,
          "Manifest locales do not match normalized localization records.");
    }
  }

  private static void ValidateSourcePackageManifest(JsonObject manifest)
  {
    if (manifest.Count != 2
        || manifest["schema_version"]?.GetValue<string>() != "1.0.0"
        || manifest["files"] is not JsonArray files
        || files.Count == 0)
    {
      throw new ExtractorException(
          ErrorCodes.CatalogSchemaInvalid,
          "The source package manifest structure is invalid.");
    }

    string? previous = null;
    var paths = new HashSet<string>(StringComparer.Ordinal);
    foreach (var node in files)
    {
      if (node is not JsonObject entry
          || entry.Count != 4
          || !TryNonEmptyText(entry["relative_path"], out var relativePath)
          || Path.IsPathRooted(relativePath)
          || relativePath.Contains('\\', StringComparison.Ordinal)
          || relativePath.Split('/').Any(part => part is "" or "." or "..")
          || !paths.Add(relativePath)
          || previous is not null && StringComparer.Ordinal.Compare(previous, relativePath) > 0
          || !TryNonEmptyText(entry["file_kind"], out _)
          || !TrySha256(entry["sha256"])
          || entry["size"] is not JsonValue sizeValue
          || !sizeValue.TryGetValue<long>(out var size)
          || size < 0)
      {
        throw new ExtractorException(
            ErrorCodes.CatalogSchemaInvalid,
            "The source package manifest contains an invalid or unsorted entry.");
      }

      previous = relativePath;
    }
  }

  private static void ValidateRelationships(Dictionary<CatalogCategory, JsonObject[]> records)
  {
    var pals = Set(records[CatalogCategory.Pals], "pal_id");
    var active = Set(records[CatalogCategory.ActiveSkills], "active_skill_id");
    var localized = Set(records[CatalogCategory.Localizations], "text_key");
    if (records[CatalogCategory.PalActiveSkills].Any(record =>
            !pals.Contains(Text(record, "pal_id")) || !active.Contains(Text(record, "active_skill_id")))
        || records[CatalogCategory.PartnerSkills].Any(record => !pals.Contains(Text(record, "pal_id")))
        || records[CatalogCategory.BreedingRecipes].Any(record =>
            !pals.Contains(Text(record, "parent_a_pal_id"))
            || !pals.Contains(Text(record, "parent_b_pal_id"))
            || !pals.Contains(Text(record, "child_pal_id"))))
    {
      throw new ExtractorException(
          ErrorCodes.CatalogReferenceInvalid,
          "A normalized record references a missing catalog ID.");
    }

    var localizationFields = new[] { "name_key", "description_key" };
    var missing = records
        .Where(pair => pair.Key is CatalogCategory.Pals
            or CatalogCategory.PassiveSkills
            or CatalogCategory.ActiveSkills
            or CatalogCategory.PartnerSkills)
        .SelectMany(pair => pair.Value)
        .SelectMany(record => localizationFields.Select(field => record[field]))
        .Where(value => value is not null)
        .Select(value => value!.GetValue<string>())
        .Any(value => !localized.Contains(value));
    if (missing)
    {
      throw new ExtractorException(
          ErrorCodes.CatalogLocalizationReferenceInvalid,
          "A normalized record references missing localization text.");
    }
  }

  private static void ValidateEvidence(
      string directory,
      Dictionary<CatalogCategory, JsonObject[]> records)
  {
    var evidence = ReadObject(Path.Combine(directory, "source-evidence.json"), ErrorCodes.CatalogFileMissing);
    var categories = evidence["categories"]?.AsObject()
        ?? throw EvidenceInvalid("categories");
    if (categories.Count != CatalogCategories.All.Count
        || evidence["unresolved_records"] is not JsonArray unresolved
        || unresolved.Count != 0
        || evidence["excluded_records"] is not JsonArray
        || evidence["warnings"] is not JsonArray)
    {
      throw EvidenceInvalid("document");
    }

    foreach (var definition in CatalogCategories.All)
    {
      if (categories[definition.CountField] is not JsonArray entries)
      {
        throw EvidenceInvalid(definition.CountField);
      }

      var sourceNames = new Dictionary<string, string>(StringComparer.Ordinal);
      string? previousKey = null;
      foreach (var entryNode in entries)
      {
        if (entryNode is not JsonObject entry
            || !TryNonEmptyText(entry["record_key"], out var recordKey)
            || !TryNonEmptyText(entry["source_internal_name"], out var sourceName)
            || entry["sources"] is not JsonArray sources
            || sources.Count == 0
            || sources.Any(source => source is not JsonObject location
                || !TryNonEmptyText(location["asset_path"], out _)
                || !TryNonEmptyText(location["row_name"], out _)
                || !TryNonEmptyText(location["property_chain"], out _))
            || !sourceNames.TryAdd(recordKey, sourceName)
            || previousKey is not null && StringComparer.Ordinal.Compare(previousKey, recordKey) > 0)
        {
          throw EvidenceInvalid(definition.CountField);
        }

        previousKey = recordKey;
      }

      CatalogTraceability.ValidateRecords(definition, records[definition.Category], sourceNames);
    }
  }

  private static void ValidateChecksums(string directory, IEnumerable<CatalogFileHash> hashes)
  {
    var path = Path.Combine(directory, "checksums.sha256");
    if (!File.Exists(path))
    {
      throw new ExtractorException(ErrorCodes.CatalogFileMissing, "Required file is missing: checksums.sha256");
    }

    var expected = string.Concat(hashes.OrderBy(value => value.FileName, StringComparer.Ordinal)
        .Select(value => $"{value.Sha256}  {value.FileName}\n"));
    if (!StringComparer.Ordinal.Equals(File.ReadAllText(path), expected))
    {
      throw new ExtractorException(ErrorCodes.CatalogHashMismatch, "checksums.sha256 is not canonical or current.");
    }
  }

  private static void ValidateSummary(string directory, string contentHash, string packageHash)
  {
    var summary = ReadObject(Path.Combine(directory, "extraction-summary.json"), ErrorCodes.CatalogFileMissing);
    if (summary["content_hash"]?.GetValue<string>() != contentHash
        || summary["package_hash"]?.GetValue<string>() != packageHash
        || summary["unresolved_count"]?.GetValue<int>() != 0
        || summary["excluded_count"]?.GetValue<int>() < 0
        || summary["warning_count"]?.GetValue<int>() < 0)
    {
      throw new ExtractorException(
          ErrorCodes.CatalogHashMismatch,
          "The extraction summary does not match the verified catalog.");
    }
  }

  private static void ValidateReport(string directory, JsonObject expected)
  {
    var actual = ReadObject(Path.Combine(directory, "validation-report.json"), ErrorCodes.CatalogFileMissing);
    SharedCatalogSchemaValidator.ValidateDefinition(actual, "CatalogValidationReport");
    if (!JsonNode.DeepEquals(actual, expected))
    {
      throw new ExtractorException(
          ErrorCodes.CatalogHashMismatch,
          "The validation report does not match a fresh verification.");
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

  private static bool TrySha256(JsonNode? node) =>
      TryNonEmptyText(node, out var value)
      && value.Length == 64
      && value.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f');

  private static ExtractorException EvidenceInvalid(string context) => new(
      ErrorCodes.CatalogSourceEvidenceInvalid,
      $"Reverse source evidence is invalid: {context}");

  private static HashSet<string> Set(IEnumerable<JsonObject> records, string field) =>
      records.Select(record => Text(record, field)).ToHashSet(StringComparer.Ordinal);

  private static string Text(JsonObject record, string field) => record[field]?.GetValue<string>()
      ?? throw new ExtractorException(ErrorCodes.CatalogSchemaInvalid, $"Missing string field: {field}");

  private static JsonObject BuildReport(
      Dictionary<CatalogCategory, JsonObject[]> records,
      string contentHash)
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
