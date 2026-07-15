using System.Globalization;
using System.Text.RegularExpressions;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Sources;

public sealed record SteamAppManifest(string AppId, string BuildId, long LastUpdated)
{
  public string LastUpdatedIso8601 => DateTimeOffset.FromUnixTimeSeconds(LastUpdated).ToString("O", CultureInfo.InvariantCulture);
}

public static partial class SteamAppManifestReader
{
  public static SteamAppManifest Read(string path)
  {
    try
    {
      var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
      foreach (Match match in VdfEntryPattern().Matches(File.ReadAllText(path)))
      {
        values[match.Groups["key"].Value] = match.Groups["value"].Value;
      }

      if (!values.TryGetValue("appid", out var appId)
          || !values.TryGetValue("buildid", out var buildId)
          || !values.TryGetValue("LastUpdated", out var lastUpdatedText)
          || !long.TryParse(lastUpdatedText, NumberStyles.None, CultureInfo.InvariantCulture, out var lastUpdated)
          || string.IsNullOrWhiteSpace(appId)
          || string.IsNullOrWhiteSpace(buildId))
      {
        throw new ExtractorException(ErrorCodes.ClientAppmanifestInvalid, "The client appmanifest lacks the required fixed fields.");
      }

      return new SteamAppManifest(appId, buildId, lastUpdated);
    }
    catch (ExtractorException)
    {
      throw;
    }
    catch (Exception error) when (error is IOException or UnauthorizedAccessException)
    {
      throw new ExtractorException(ErrorCodes.ClientAppmanifestInvalid, "The client appmanifest cannot be read.");
    }
  }

  [GeneratedRegex("\\\"(?<key>[^\\\"]+)\\\"\\s+\\\"(?<value>[^\\\"]*)\\\"", RegexOptions.CultureInvariant)]
  private static partial Regex VdfEntryPattern();
}
