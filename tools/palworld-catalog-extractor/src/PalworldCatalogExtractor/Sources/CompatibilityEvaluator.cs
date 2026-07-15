using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Sources;

public sealed record CompatibilityResult(string Status, IReadOnlyList<string> Evidence);

public static class CompatibilityEvaluator
{
  public static CompatibilityResult Evaluate(ExtractionConfig config, SteamAppManifest clientManifest)
  {
    if (!StringComparer.Ordinal.Equals(config.ClientGameVersion, config.ServerGameVersion))
    {
      return new CompatibilityResult("mismatch", ["client_game_version_differs_from_target_server_game_version"]);
    }

    return new CompatibilityResult(
        "exact_game_version_match",
        [
            "client_game_version_equals_target_server_game_version",
                $"client_build_recorded:{clientManifest.BuildId}",
                $"target_server_build_recorded:{config.ServerBuildId}",
        ]);
  }

  public static CompatibilityResult RequireExact(ExtractionConfig config, SteamAppManifest clientManifest)
  {
    if (!StringComparer.Ordinal.Equals(config.ClientAppId, clientManifest.AppId))
    {
      throw new ExtractorException(
          ErrorCodes.ClientAppmanifestInvalid,
          "The client appmanifest App ID does not match the configured client App ID.");
    }

    var result = Evaluate(config, clientManifest);
    if (result.Status != "exact_game_version_match")
    {
      throw new ExtractorException(
          ErrorCodes.SourceGameVersionMismatch,
          "Client and target Dedicated Server game versions are not identical.");
    }

    return result;
  }
}
