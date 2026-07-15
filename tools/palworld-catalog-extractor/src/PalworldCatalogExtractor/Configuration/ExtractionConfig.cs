using System.Text.Json;
using System.Text.Json.Serialization;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Configuration;

public sealed class ExtractionConfig
{
  private static readonly JsonSerializerOptions SerializerOptions = new()
  {
    PropertyNameCaseInsensitive = false,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
  };

  [JsonPropertyName("paks_path")]
  public required string PaksPath { get; init; }

  [JsonPropertyName("mappings_path")]
  public required string MappingsPath { get; init; }

  [JsonPropertyName("client_appmanifest_path")]
  public required string ClientAppmanifestPath { get; init; }

  [JsonPropertyName("client_app_id")]
  public required string ClientAppId { get; init; }

  [JsonPropertyName("client_game_version")]
  public required string ClientGameVersion { get; init; }

  [JsonPropertyName("server_app_id")]
  public required string ServerAppId { get; init; }

  [JsonPropertyName("server_build_id")]
  public required string ServerBuildId { get; init; }

  [JsonPropertyName("server_game_version")]
  public required string ServerGameVersion { get; init; }

  [JsonPropertyName("server_appmanifest_sha256")]
  public required string ServerAppmanifestSha256 { get; init; }

  [JsonPropertyName("output_path")]
  public required string OutputPath { get; init; }

  [JsonPropertyName("locales")]
  public required string[] Locales { get; init; }

  [JsonPropertyName("inventory_sample_limit")]
  public required int InventorySampleLimit { get; init; }

  public static ExtractionConfig Load(string path)
  {
    try
    {
      var config = JsonSerializer.Deserialize<ExtractionConfig>(File.ReadAllText(path), SerializerOptions)
          ?? throw new JsonException("Empty configuration");
      config.Validate();
      return config.ResolveRelativePaths(Path.GetDirectoryName(Path.GetFullPath(path))!);
    }
    catch (ExtractorException)
    {
      throw;
    }
    catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
    {
      throw new ExtractorException(ErrorCodes.ConfigurationInvalid, "The extraction configuration is missing or invalid.");
    }
  }

  public void Validate()
  {
    if (
        string.IsNullOrWhiteSpace(PaksPath)
        || string.IsNullOrWhiteSpace(MappingsPath)
        || string.IsNullOrWhiteSpace(ClientAppmanifestPath)
        || ClientAppId != "1623730"
        || string.IsNullOrWhiteSpace(ClientGameVersion)
        || string.IsNullOrWhiteSpace(ServerAppId)
        || string.IsNullOrWhiteSpace(ServerBuildId)
        || string.IsNullOrWhiteSpace(ServerGameVersion)
        || string.IsNullOrWhiteSpace(OutputPath)
        || ServerAppmanifestSha256.Length != 64
        || Locales.Length == 0
        || InventorySampleLimit is < 1 or > 100)
    {
      throw new ExtractorException(ErrorCodes.ConfigurationInvalid, "The extraction configuration does not satisfy its fail-closed contract.");
    }
  }

  private ExtractionConfig ResolveRelativePaths(string root) => new()
  {
    PaksPath = Resolve(root, PaksPath),
    MappingsPath = Resolve(root, MappingsPath),
    ClientAppmanifestPath = Resolve(root, ClientAppmanifestPath),
    ClientAppId = ClientAppId,
    ClientGameVersion = ClientGameVersion,
    ServerAppId = ServerAppId,
    ServerBuildId = ServerBuildId,
    ServerGameVersion = ServerGameVersion,
    ServerAppmanifestSha256 = ServerAppmanifestSha256.ToLowerInvariant(),
    OutputPath = Resolve(root, OutputPath),
    Locales = Locales.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray(),
    InventorySampleLimit = InventorySampleLimit,
  };

  private static string Resolve(string root, string value) => Path.GetFullPath(Path.IsPathFullyQualified(value) ? value : Path.Combine(root, value));
}
