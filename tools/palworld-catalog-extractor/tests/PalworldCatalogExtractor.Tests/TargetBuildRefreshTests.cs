using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Doctor;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class TargetBuildRefreshTests
{
  private const string PreviousBuild = "24088465";
  private const string PreviousGameVersion = "v1.0.0.100427";
  private const string PreviousAppmanifestSha256 = "5dd1c163956fb8aff7ae7c0bc2e2ef1ed38ccb594919d3cc58d1ac1674a49b8c";
  private const string CurrentBuild = "24181105";
  private const string CurrentGameVersion = "v1.0.1.100619";
  private const string CurrentAppmanifestSha256 = "98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189";

  [Fact]
  public void TargetBuild24181105ExampleConfigurationPassesValidation()
  {
    var root = FindRepositoryRoot();
    var path = Path.Combine(root, "tools", "palworld-catalog-extractor", "config", "extraction.example.json");

    var config = ExtractionConfig.Load(path);
    var json = JsonNode.Parse(File.ReadAllText(path))!.AsObject();

    Assert.Equal("1623730", config.ClientAppId);
    Assert.Equal("2394010", config.ServerAppId);
    Assert.Equal(CurrentBuild, config.ServerBuildId);
    Assert.Equal(CurrentGameVersion, config.ClientGameVersion);
    Assert.Equal(CurrentGameVersion, config.ServerGameVersion);
    Assert.Equal(CurrentAppmanifestSha256, config.ServerAppmanifestSha256);
    Assert.False(json.ContainsKey("client_build_id"));
    Assert.False(json.ContainsKey("client_appmanifest_sha256"));
    Assert.False(json.ContainsKey("mappings_usmap_sha256"));
    Assert.DoesNotContain(PreviousAppmanifestSha256, File.ReadAllText(path), StringComparison.Ordinal);
  }

  [Theory]
  [InlineData(PreviousBuild, CurrentGameVersion)]
  [InlineData(CurrentBuild, PreviousGameVersion)]
  public void PreviousTargetEvidenceCannotBeLoadedByBuild24181105(
      string evidenceBuild,
      string evidenceGameVersion)
  {
    using var output = new TemporaryDirectory();
    DeterministicJson.WriteFile(
        Path.Combine(output.Path, ExtractionEvidenceGuard.EvidenceManifestFileName),
        new JsonObject
        {
          ["schema_version"] = "1.0.0",
          ["source_client_app_id"] = "1623730",
          ["target_server_app_id"] = "2394010",
          ["target_server_appmanifest_sha256"] = CurrentAppmanifestSha256,
          ["target_server_build_id"] = evidenceBuild,
          ["target_server_game_version"] = evidenceGameVersion,
        });

    var error = Assert.Throws<ExtractorException>(() => ExtractionEvidenceGuard.RequireCurrent(new ExtractionConfig
    {
      PaksPath = "fixture-paks",
      MappingsPath = "fixture-Mappings.usmap",
      ClientAppmanifestPath = "fixture-appmanifest.acf",
      ClientAppId = "1623730",
      ClientGameVersion = CurrentGameVersion,
      ServerAppId = "2394010",
      ServerBuildId = CurrentBuild,
      ServerGameVersion = CurrentGameVersion,
      ServerAppmanifestSha256 = CurrentAppmanifestSha256,
      OutputPath = output.Path,
      Locales = ["en-US"],
      InventorySampleLimit = 5,
    }));

    Assert.Equal(ErrorCodes.StaleExtractionEvidence, error.Code);
  }

  [Fact]
  public void SevenCategoryPublicationGateIsUnchanged()
  {
    Assert.Equal(
        [
          "pals",
          "passive_skills",
          "active_skills",
          "pal_active_skills",
          "partner_skills",
          "breeding_recipes",
          "localizations",
        ],
        CatalogCategories.All.Select(value => value.CountField));
  }

  [Fact]
  public void HistoricalAcceptanceReportRetainsPreviousTargetFacts()
  {
    var report = ReadRepositoryFile("docs", "reviews", "phase-4-real-data-acceptance.md");

    Assert.Contains(PreviousBuild, report, StringComparison.Ordinal);
    Assert.Contains(PreviousGameVersion, report, StringComparison.Ordinal);
    Assert.Contains(PreviousAppmanifestSha256, report, StringComparison.Ordinal);
    Assert.Contains("REAL_BASE_CATALOG_MISSING", report, StringComparison.Ordinal);
  }

  [Fact]
  public void TargetBuildRefreshReportContainsNewServerEvidence()
  {
    var report = ReadRepositoryFile("docs", "reviews", "phase-4-target-build-refresh-24181105.md");

    Assert.Contains(CurrentBuild, report, StringComparison.Ordinal);
    Assert.Contains(CurrentGameVersion, report, StringComparison.Ordinal);
    Assert.Contains(CurrentAppmanifestSha256, report, StringComparison.Ordinal);
    Assert.Contains("1784111967", report, StringComparison.Ordinal);
    Assert.Contains("2026-07-15T10:39:27Z", report, StringComparison.Ordinal);
    Assert.Contains("REAL_BASE_CATALOG_MISSING", report, StringComparison.Ordinal);
  }

  [Fact]
  public void RepositoryDoesNotTrackRealExtractionData()
  {
    var root = FindRepositoryRoot();
    var result = RunGit(root, "ls-files", "--", "data/game-catalog");

    Assert.Equal(0, result.ExitCode);
    Assert.True(string.IsNullOrWhiteSpace(result.Output));
  }

  private static string ReadRepositoryFile(params string[] parts) =>
      File.ReadAllText(Path.Combine([FindRepositoryRoot(), .. parts]));

  private static string FindRepositoryRoot()
  {
    var current = new DirectoryInfo(AppContext.BaseDirectory);
    while (current is not null)
    {
      if (File.Exists(Path.Combine(current.FullName, "AGENTS.md"))
          && Directory.Exists(Path.Combine(current.FullName, ".git")))
      {
        return current.FullName;
      }

      current = current.Parent;
    }

    throw new InvalidOperationException("Repository root not found.");
  }

  private static ProcessResult RunGit(string workingDirectory, params string[] arguments)
  {
    using var process = new System.Diagnostics.Process
    {
      StartInfo = new System.Diagnostics.ProcessStartInfo
      {
        FileName = "git",
        WorkingDirectory = workingDirectory,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
      },
    };
    foreach (var argument in arguments)
    {
      process.StartInfo.ArgumentList.Add(argument);
    }

    process.Start();
    var output = process.StandardOutput.ReadToEnd();
    process.WaitForExit();
    return new ProcessResult(process.ExitCode, output);
  }

  private sealed record ProcessResult(int ExitCode, string Output);
}
