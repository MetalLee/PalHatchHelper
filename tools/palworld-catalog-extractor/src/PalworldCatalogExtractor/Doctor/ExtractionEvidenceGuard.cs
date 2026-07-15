using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Doctor;

public static class ExtractionEvidenceGuard
{
  public const string EvidenceManifestFileName = "extraction-evidence-manifest.json";

  private static readonly string[] LegacyEvidenceFileNames =
  [
      "source-package-manifest.json",
      "asset-inventory.json",
      "data-table-inventory.json",
      "blueprint-property-inventory.json",
      "localization-inventory.json",
      "unresolved-source-candidates.json",
      "extraction-summary.json",
  ];

  public static void RequireCurrent(ExtractionConfig config)
  {
    if (!Directory.Exists(config.OutputPath))
    {
      return;
    }

    var evidencePath = Path.Combine(config.OutputPath, EvidenceManifestFileName);
    var catalogPath = Path.Combine(config.OutputPath, "manifest.json");
    if (File.Exists(evidencePath))
    {
      ValidateTargetEvidence(config, ReadObject(evidencePath));
    }

    if (File.Exists(catalogPath))
    {
      ValidateCatalogTarget(config, ReadObject(catalogPath));
    }

    if (!File.Exists(evidencePath)
        && !File.Exists(catalogPath)
        && LegacyEvidenceFileNames.Any(file => File.Exists(Path.Combine(config.OutputPath, file))))
    {
      throw Stale();
    }
  }

  public static void RequireCurrent(ExtractionConfig config, SteamAppManifest clientManifest)
  {
    RequireCurrent(config);
    var path = Path.Combine(config.OutputPath, EvidenceManifestFileName);
    if (!File.Exists(path))
    {
      return;
    }

    var evidence = ReadObject(path);
    var sourceManifestPath = Path.Combine(config.OutputPath, "source-package-manifest.json");
    if (!Matches(evidence, "source_client_app_id", config.ClientAppId)
        || !Matches(evidence, "source_client_build_id", clientManifest.BuildId)
        || !Matches(evidence, "source_client_game_version", config.ClientGameVersion)
        || !Matches(evidence, "source_client_appmanifest_sha256", Hashing.Sha256File(config.ClientAppmanifestPath))
        || !Matches(evidence, "mappings_usmap_sha256", Hashing.Sha256File(config.MappingsPath))
        || !File.Exists(sourceManifestPath)
        || !Matches(
            evidence,
            "source_package_manifest_sha256",
            SourcePackageManifestBuilder.ComputePackageHash(ReadObject(sourceManifestPath))))
    {
      throw Stale();
    }
  }

  public static void WriteCurrent(
      ExtractionConfig config,
      SteamAppManifest clientManifest,
      string sourcePackageManifestSha256)
  {
    var manifest = new JsonObject
    {
      ["mappings_usmap_sha256"] = Hashing.Sha256File(config.MappingsPath),
      ["schema_version"] = "1.0.0",
      ["source_client_app_id"] = config.ClientAppId,
      ["source_client_appmanifest_sha256"] = Hashing.Sha256File(config.ClientAppmanifestPath),
      ["source_client_build_id"] = clientManifest.BuildId,
      ["source_client_game_version"] = config.ClientGameVersion,
      ["source_package_manifest_sha256"] = sourcePackageManifestSha256,
      ["target_server_app_id"] = config.ServerAppId,
      ["target_server_appmanifest_sha256"] = config.ServerAppmanifestSha256,
      ["target_server_build_id"] = config.ServerBuildId,
      ["target_server_game_version"] = config.ServerGameVersion,
    };
    DeterministicJson.WriteFile(Path.Combine(config.OutputPath, EvidenceManifestFileName), manifest);
  }

  private static void ValidateTargetEvidence(ExtractionConfig config, JsonObject evidence)
  {
    if (!Matches(evidence, "schema_version", "1.0.0")
        || !Matches(evidence, "source_client_app_id", config.ClientAppId)
        || !Matches(evidence, "target_server_app_id", config.ServerAppId)
        || !Matches(evidence, "target_server_build_id", config.ServerBuildId)
        || !Matches(evidence, "target_server_game_version", config.ServerGameVersion)
        || !Matches(evidence, "target_server_appmanifest_sha256", config.ServerAppmanifestSha256))
    {
      throw Stale();
    }
  }

  private static void ValidateCatalogTarget(ExtractionConfig config, JsonObject manifest)
  {
    var provenance = manifest["source_provenance"] as JsonObject;
    if (!Matches(manifest, "game_build_id", config.ServerBuildId)
        || !Matches(manifest, "game_version", config.ServerGameVersion)
        || provenance is null
        || !Matches(provenance, "target_server_app_id", config.ServerAppId)
        || !Matches(provenance, "target_server_build_id", config.ServerBuildId)
        || !Matches(provenance, "target_server_game_version", config.ServerGameVersion)
        || !Matches(provenance, "target_server_appmanifest_sha256", config.ServerAppmanifestSha256))
    {
      throw Stale();
    }
  }

  private static JsonObject ReadObject(string path)
  {
    try
    {
      return JsonNode.Parse(File.ReadAllText(path))?.AsObject() ?? throw new InvalidDataException();
    }
    catch (Exception error) when (error is IOException
        or UnauthorizedAccessException
        or System.Text.Json.JsonException
        or InvalidOperationException
        or InvalidDataException)
    {
      throw Stale();
    }
  }

  private static bool Matches(JsonObject value, string field, string expected) =>
      value[field] is JsonValue scalar
      && scalar.TryGetValue<string>(out var actual)
      && StringComparer.Ordinal.Equals(actual, expected);

  private static ExtractorException Stale() => new(
      ErrorCodes.StaleExtractionEvidence,
      "Extraction evidence belongs to a different or unbound target; use a new version-isolated directory.");
}
