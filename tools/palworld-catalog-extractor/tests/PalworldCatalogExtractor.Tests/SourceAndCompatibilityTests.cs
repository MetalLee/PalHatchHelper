using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
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

    Assert.Equal(ErrorCodes.GameVersionMismatch, error.Code);
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
      string serverAppId = "2394010") => new()
      {
        PaksPath = "paks",
        MappingsPath = "Mappings.usmap",
        ClientAppmanifestPath = "appmanifest_1623730.acf",
        ClientGameVersion = clientVersion,
        ServerAppId = serverAppId,
        ServerBuildId = "server-build",
        ServerGameVersion = serverVersion,
        ServerAppmanifestSha256 = new string('a', 64),
        OutputPath = "output",
        Locales = ["en-US"],
        InventorySampleLimit = 5,
      };
}
