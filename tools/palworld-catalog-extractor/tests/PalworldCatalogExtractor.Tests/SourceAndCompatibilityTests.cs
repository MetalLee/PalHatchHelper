using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Doctor;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class SourceAndCompatibilityTests
{
  [Fact]
  public void SourcePackageManifestHashUsesCanonicalSortedRelativePaths()
  {
    var first = SourcePackageManifestBuilder.FromEntries(
    [
        new("paks/z.ucas", 20, new string('b', 64), "ucas"),
            new("paks/a.pak", 10, new string('a', 64), "pak"),
        ]);
    var second = SourcePackageManifestBuilder.FromEntries(
    [
        new("paks/a.pak", 10, new string('a', 64), "pak"),
            new("paks/z.ucas", 20, new string('b', 64), "ucas"),
        ]);

    Assert.Equal(DeterministicJson.Serialize(first), DeterministicJson.Serialize(second));
    Assert.Equal(Hashing.Sha256(DeterministicJson.Serialize(first)), SourcePackageManifestBuilder.ComputePackageHash(first));
    Assert.DoesNotContain("appmanifest_sha256", DeterministicJson.Serialize(first), StringComparison.Ordinal);
  }

  [Fact]
  public void BuildIdsMayDifferWhenReportedGameVersionsMatch()
  {
    var config = TestConfig("v1.0.0", "v1.0.0");
    var result = CompatibilityEvaluator.Evaluate(config, new SteamAppManifest("1623730", "client-build", 1));

    Assert.Equal("exact_game_version_match", result.Status);
    Assert.NotEqual("client-build", config.ServerBuildId);
  }

  [Fact]
  public void DifferentClientAndServerGameVersionsStopExtraction()
  {
    var config = TestConfig("v1.0.1", "v1.0.0");

    var error = Assert.Throws<ExtractorException>(
        () => CompatibilityEvaluator.RequireExact(config, new SteamAppManifest("1623730", "client-build", 1)));

    Assert.Equal(ErrorCodes.SourceGameVersionMismatch, error.Code);
  }

  [Fact]
  public void PreviousServerBuildEvidenceCannotBeLoadedByANewTarget()
  {
    using var output = new TemporaryDirectory();
    WriteEvidenceManifest(output.Path, serverBuildId: "previous-server-build", serverGameVersion: "v-next");
    var config = TestConfig("v-next", "v-next", serverBuildId: "new-server-build", outputPath: output.Path);

    var error = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(config));

    Assert.Equal(ErrorCodes.StaleExtractionEvidence, error.Code);
  }

  [Fact]
  public void PreviousGameVersionEvidenceCannotBeLoadedByANewTarget()
  {
    using var output = new TemporaryDirectory();
    WriteEvidenceManifest(output.Path, serverBuildId: "new-server-build", serverGameVersion: "v-previous");
    var config = TestConfig("v-next", "v-next", serverBuildId: "new-server-build", outputPath: output.Path);

    var error = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(config));

    Assert.Equal(ErrorCodes.StaleExtractionEvidence, error.Code);
  }

  [Fact]
  public void LegacyInventoryWithoutATargetManifestIsRejected()
  {
    using var output = new TemporaryDirectory();
    File.WriteAllText(Path.Combine(output.Path, "asset-inventory.json"), "{\"assets\":[]}\n");

    var error = Assert.Throws<ExtractorException>(() =>
        ExtractionEvidenceGuard.RequireCurrent(TestConfig("v-next", "v-next", outputPath: output.Path)));

    Assert.Equal(ErrorCodes.StaleExtractionEvidence, error.Code);
  }

  [Fact]
  public void ClientMappingsAndSourceManifestEvidenceMustMatchTheCurrentInputs()
  {
    using var output = new TemporaryDirectory();
    var clientPath = Path.Combine(output.Path, "client-appmanifest.acf");
    var mappingsPath = Path.Combine(output.Path, "Mappings.usmap");
    File.WriteAllText(clientPath, "current-client-manifest");
    File.WriteAllText(mappingsPath, "current-mappings");
    var sourceManifest = SourcePackageManifestBuilder.FromEntries(
        [new("paks/fixture.pak", 10, new string('b', 64), "pak")]);
    DeterministicJson.WriteFile(Path.Combine(output.Path, "source-package-manifest.json"), sourceManifest);
    var config = TestConfig(
        "v-next",
        "v-next",
        outputPath: output.Path,
        clientAppmanifestPath: clientPath,
        mappingsPath: mappingsPath);
    var client = new SteamAppManifest("1623730", "fixture-client-build", 1);
    ExtractionEvidenceGuard.WriteCurrent(
        config,
        client,
        SourcePackageManifestBuilder.ComputePackageHash(sourceManifest));

    ExtractionEvidenceGuard.RequireCurrent(config, client);

    File.AppendAllText(mappingsPath, "-stale");
    var mappingsError = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(config, client));
    Assert.Equal(ErrorCodes.StaleExtractionEvidence, mappingsError.Code);

    File.WriteAllText(mappingsPath, "current-mappings");
    File.AppendAllText(clientPath, "-stale");
    var clientError = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(config, client));
    Assert.Equal(ErrorCodes.StaleExtractionEvidence, clientError.Code);

    File.WriteAllText(clientPath, "current-client-manifest");
    sourceManifest["files"]![0]!["size"] = 11;
    DeterministicJson.WriteFile(Path.Combine(output.Path, "source-package-manifest.json"), sourceManifest);
    var sourceError = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(config, client));
    Assert.Equal(ErrorCodes.StaleExtractionEvidence, sourceError.Code);
  }

  [Fact]
  public void TargetServerFactsRemainConfigurationDriven()
  {
    var config = TestConfig("v1.0.0", "v1.0.0", serverAppId: "fixture-dedicated-server");
    config.Validate();

    var invalid = TestConfig("v1.0.0", "v1.0.0", serverAppId: "");

    var error = Assert.Throws<ExtractorException>(invalid.Validate);

    Assert.Equal(ErrorCodes.ConfigurationInvalid, error.Code);
  }

  private static ExtractionConfig TestConfig(
      string clientVersion,
      string serverVersion,
      string serverAppId = "fixture-dedicated-server",
      string serverBuildId = "fixture-server-build",
      string outputPath = "output",
      string clientAppmanifestPath = "appmanifest_1623730.acf",
      string mappingsPath = "Mappings.usmap") => new()
      {
        PaksPath = "paks",
        MappingsPath = mappingsPath,
        ClientAppmanifestPath = clientAppmanifestPath,
        ClientAppId = "1623730",
        ClientGameVersion = clientVersion,
        ServerAppId = serverAppId,
        ServerBuildId = serverBuildId,
        ServerGameVersion = serverVersion,
        ServerAppmanifestSha256 = new string('a', 64),
        OutputPath = outputPath,
        Locales = ["en-US"],
        InventorySampleLimit = 5,
      };

  private static void WriteEvidenceManifest(
      string outputPath,
      string serverBuildId,
      string serverGameVersion)
  {
    DeterministicJson.WriteFile(
        Path.Combine(outputPath, ExtractionEvidenceGuard.EvidenceManifestFileName),
        new System.Text.Json.Nodes.JsonObject
        {
          ["schema_version"] = "1.0.0",
          ["source_client_app_id"] = "1623730",
          ["target_server_app_id"] = "fixture-dedicated-server",
          ["target_server_appmanifest_sha256"] = new string('a', 64),
          ["target_server_build_id"] = serverBuildId,
          ["target_server_game_version"] = serverGameVersion,
        });
  }
}
