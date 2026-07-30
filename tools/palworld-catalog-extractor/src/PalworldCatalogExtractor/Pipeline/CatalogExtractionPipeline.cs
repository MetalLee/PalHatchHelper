using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Readers;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

public sealed record ExtractionRequest(
    string OutputPath,
    string GameBuildId,
    string GameVersion,
    JsonObject SourcePackageManifest,
    SourceProvenance SourceProvenance,
    IReadOnlyList<string> Locales);

public sealed record ExtractionResult(string ContentHash, IReadOnlyDictionary<string, int> Counts);

public sealed class CatalogExtractionPipeline(IEnumerable<ICatalogReader> readers)
{
  private readonly ICatalogReader[] _readers = readers.ToArray();

  public async Task<ExtractionResult> ExtractAsync(ExtractionRequest request, CancellationToken cancellationToken)
  {
    EnsureReaderSet();

    var results = new Dictionary<CatalogCategory, ReaderResult>();
    foreach (var reader in _readers.OrderBy(value => value.Category))
    {
      cancellationToken.ThrowIfCancellationRequested();
      results.Add(reader.Category, await reader.ReadAsync(cancellationToken).ConfigureAwait(false));
    }

    if (results.Values.SelectMany(value => value.UnresolvedRecords).Any())
    {
      throw new ExtractorException(
          ErrorCodes.UnresolvedGameFacts,
          "Extraction stopped because one or more game facts remain unresolved.");
    }

    if (results.Values.Any(value => value.NormalizedRecords.Count == 0))
    {
      throw new ExtractorException(
          ErrorCodes.FullCatalogCategoryEmpty,
          "A full catalog requires every one of the nine categories to be non-empty.");
    }

    CatalogTraceability.ValidateReaderResults(results);

    using var output = AtomicCatalogDirectory.Begin(request.OutputPath);
    var stagedRequest = request with { OutputPath = output.StagingPath };

    var fileHashes = new List<CatalogFileHash>();
    var counts = new Dictionary<string, int>(StringComparer.Ordinal);
    foreach (var definition in CatalogCategories.All)
    {
      var records = results[definition.Category].NormalizedRecords
          .OrderBy(record => CatalogCategories.RecordKey(definition.Category, record), StringComparer.Ordinal)
          .ToArray();
      var path = Path.Combine(output.StagingPath, definition.FileName);
      WriteJsonLines(path, records);
      counts.Add(definition.CountField, records.Length);
      fileHashes.Add(new CatalogFileHash(definition.FileName, Hashing.Sha256File(path), records.Length));
    }

    var contentHash = Hashing.ComputeContentHash(fileHashes);
    var packageHash = SourcePackageManifestBuilder.ComputePackageHash(request.SourcePackageManifest);
    if (!string.Equals(packageHash, request.SourceProvenance.SourcePackageManifestSha256, StringComparison.Ordinal))
    {
      throw new ExtractorException(ErrorCodes.CatalogHashMismatch, "The source package manifest hash does not match provenance.");
    }

    DeterministicJson.WriteFile(
        Path.Combine(output.StagingPath, "source-package-manifest.json"),
        request.SourcePackageManifest);
    WriteEvidence(output.StagingPath, results);
    WriteManifest(stagedRequest, fileHashes, counts, contentHash, packageHash);
    WriteChecksums(output.StagingPath, fileHashes);
    WriteSummary(output.StagingPath, results, contentHash, packageHash);

    var report = CatalogVerifier.VerifyForExtraction(output.StagingPath);
    DeterministicJson.WriteFile(Path.Combine(output.StagingPath, "validation-report.json"), report);
    output.Publish();
    return new ExtractionResult(contentHash, counts);
  }

  private void EnsureReaderSet()
  {
    if (_readers.Length != CatalogCategories.All.Count
        || _readers.Select(value => value.Category).Distinct().Count() != CatalogCategories.All.Count
        || CatalogCategories.All.Any(definition => _readers.All(reader => reader.Category != definition.Category)))
    {
      throw new ExtractorException(
          ErrorCodes.FullCatalogReaderMissing,
          "Exactly one reader is required for every full-catalog category.");
    }
  }

  private static void WriteJsonLines(string path, IEnumerable<JsonObject> records)
  {
    AtomicFileWriter.WriteUtf8(path, writer =>
    {
      foreach (var record in records)
      {
        writer.Write(DeterministicJson.Serialize(record));
        writer.Write('\n');
      }
    });
  }

  private static void WriteManifest(
      ExtractionRequest request,
      IReadOnlyList<CatalogFileHash> files,
      Dictionary<string, int> counts,
      string contentHash,
      string packageHash)
  {
    var countNode = new JsonObject();
    foreach (var definition in CatalogCategories.All)
    {
      countNode[definition.CountField] = counts[definition.CountField];
    }

    var fileNode = new JsonArray(files.OrderBy(value => value.FileName, StringComparer.Ordinal).Select(value =>
        (JsonNode)new JsonObject
        {
          ["filename"] = value.FileName,
          ["record_count"] = value.RecordCount,
          ["sha256"] = value.Sha256,
        }).ToArray());
    var manifest = new JsonObject
    {
      ["compression"] = "tar.zst",
      ["content_hash"] = contentHash,
      ["counts"] = countNode,
      ["created_at"] = request.SourceProvenance.ExtractedAt.ToUniversalTime().ToString("O", System.Globalization.CultureInfo.InvariantCulture),
      ["extractor_name"] = "palhatch-full-catalog-extractor",
      ["extractor_version"] = request.SourceProvenance.ExtractorRepositoryCommit,
      ["files"] = fileNode,
      ["game_build_id"] = request.GameBuildId,
      ["game_version"] = request.GameVersion,
      ["locales"] = new JsonArray(request.Locales.Order(StringComparer.Ordinal).Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
      ["package_hash"] = packageHash,
      ["schema_version"] = "2.0.0",
      ["source_provenance"] = request.SourceProvenance.ToJson(),
    };
    DeterministicJson.WriteFile(Path.Combine(request.OutputPath, "manifest.json"), manifest);
  }

  private static void WriteEvidence(string outputPath, Dictionary<CatalogCategory, ReaderResult> results)
  {
    var categories = new JsonObject();
    var excluded = new JsonArray();
    var warnings = new JsonArray();
    foreach (var definition in CatalogCategories.All)
    {
      var result = results[definition.Category];
      categories[definition.CountField] = new JsonArray(result.SourceEvidenceRecords
          .OrderBy(value => value.RecordKey, StringComparer.Ordinal)
          .Select(value => (JsonNode)new JsonObject
          {
            ["record_key"] = value.RecordKey,
            ["source_internal_name"] = value.SourceInternalName,
            ["sources"] = new JsonArray(value.Sources
                .OrderBy(source => source.AssetPath, StringComparer.Ordinal)
                .ThenBy(source => source.RowName, StringComparer.Ordinal)
                .ThenBy(source => source.PropertyChain, StringComparer.Ordinal)
                .Select(source => (JsonNode)new JsonObject
                {
                  ["asset_path"] = source.AssetPath,
                  ["property_chain"] = source.PropertyChain,
                  ["row_name"] = source.RowName,
                }).ToArray()),
          }).ToArray());
      foreach (var item in result.ExcludedRecords
                   .OrderBy(value => value.Category, StringComparer.Ordinal)
                   .ThenBy(value => value.SourceInternalName, StringComparer.Ordinal)
                   .ThenBy(value => value.ReasonCode, StringComparer.Ordinal))
      {
        excluded.Add(new JsonObject
        {
          ["category"] = item.Category,
          ["reason_code"] = item.ReasonCode,
          ["source_internal_name"] = item.SourceInternalName,
        });
      }

      foreach (var item in result.Warnings
                   .OrderBy(value => value.Code, StringComparer.Ordinal)
                   .ThenBy(value => value.SourceCandidate, StringComparer.Ordinal))
      {
        warnings.Add(new JsonObject { ["code"] = item.Code, ["source_candidate"] = item.SourceCandidate });
      }
    }

    DeterministicJson.WriteFile(Path.Combine(outputPath, "source-evidence.json"), new JsonObject
    {
      ["categories"] = categories,
      ["excluded_records"] = excluded,
      ["schema_version"] = "1.0.0",
      ["unresolved_records"] = new JsonArray(),
      ["warnings"] = warnings,
    });
  }

  private static void WriteChecksums(string outputPath, IEnumerable<CatalogFileHash> files)
  {
    var text = string.Concat(files.OrderBy(value => value.FileName, StringComparer.Ordinal)
        .Select(value => $"{value.Sha256}  {value.FileName}\n"));
    AtomicFileWriter.WriteUtf8(Path.Combine(outputPath, "checksums.sha256"), writer => writer.Write(text));
  }

  private static void WriteSummary(
      string outputPath,
      IReadOnlyDictionary<CatalogCategory, ReaderResult> results,
      string contentHash,
      string packageHash)
  {
    DeterministicJson.WriteFile(Path.Combine(outputPath, "extraction-summary.json"), new JsonObject
    {
      ["content_hash"] = contentHash,
      ["excluded_count"] = results.Values.Sum(value => value.ExcludedRecords.Count),
      ["package_hash"] = packageHash,
      ["unresolved_count"] = 0,
      ["warning_count"] = results.Values.Sum(value => value.Warnings.Count),
    });
  }
}
