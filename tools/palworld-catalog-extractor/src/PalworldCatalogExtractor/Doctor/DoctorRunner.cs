using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Engine;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Discovery;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Doctor;

public static class DoctorRunner
{
  private const long MinimumFreeBytes = 10L * 1024 * 1024 * 1024;

  public static JsonObject Run(ExtractionConfig config)
  {
    ExtractionEvidenceGuard.RequireCurrent(config);
    Require(Environment.Is64BitProcess && RuntimeInformation.IsOSPlatform(OSPlatform.Windows), ErrorCodes.WindowsX64Required, "Windows x64 is required.");
    Require(Environment.Version.Major == 10, ErrorCodes.Dotnet10Required, ".NET 10 is required.");
    Require(Directory.Exists(config.PaksPath), ErrorCodes.PakDirectoryInvalid, "The PAK directory is missing.");
    Require(
        Directory.EnumerateFiles(config.PaksPath, "Pal-Windows.pak", SearchOption.TopDirectoryOnly).Any(),
        ErrorCodes.PalWindowsPakMissing,
        "Pal-Windows.pak is missing.");
    Require(File.Exists(config.MappingsPath), ErrorCodes.MappingsInvalid, "Mappings.usmap is missing.");
    Require(File.Exists(config.ClientAppmanifestPath), ErrorCodes.ClientAppmanifestInvalid, "The client appmanifest is missing.");
    GitOutputGuard.RequireIgnoredAndUntracked(config.OutputPath);
    OpenReadOnly(config.MappingsPath);
    OpenReadOnly(config.ClientAppmanifestPath);
    foreach (var path in Directory.EnumerateFiles(config.PaksPath, "*", SearchOption.TopDirectoryOnly)
                 .Where(path => Path.GetExtension(path) is ".pak" or ".utoc" or ".ucas"))
    {
      OpenReadOnly(path);
    }

    try
    {
      _ = new FileUsmapTypeMappingsProvider(config.MappingsPath, StringComparer.Ordinal);
    }
    catch (Exception)
    {
      throw new ExtractorException(ErrorCodes.MappingsInvalid, "Mappings.usmap could not be parsed by the pinned CUE4Parse build.");
    }

    var drive = new DriveInfo(Path.GetPathRoot(config.OutputPath)!);
    Require(drive.AvailableFreeSpace >= MinimumFreeBytes, ErrorCodes.DiskSpaceInsufficient, "At least 10 GiB of free output space is required.");
    var appManifest = SteamAppManifestReader.Read(config.ClientAppmanifestPath);
    ExtractionEvidenceGuard.RequireCurrent(config, appManifest);
    var compatibility = CompatibilityEvaluator.RequireExact(config, appManifest);
    var mappingsProbeAsset = RequireMappingsCompatibleWithCurrentAssets(config);
    var sourceManifest = SourcePackageManifestBuilder.Build(config);
    var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
    var containerCounts = Directory.EnumerateFiles(config.PaksPath, "*", SearchOption.TopDirectoryOnly)
        .GroupBy(path => Path.GetExtension(path).ToLowerInvariant())
        .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
    return new JsonObject
    {
      ["client_app_id"] = appManifest.AppId,
      ["client_appmanifest_sha256"] = Hashing.Sha256File(config.ClientAppmanifestPath),
      ["client_build_id"] = appManifest.BuildId,
      ["client_game_version"] = config.ClientGameVersion,
      ["client_last_updated"] = appManifest.LastUpdatedIso8601,
      ["compatibility_status"] = compatibility.Status,
      ["cue4parse_version"] = "1.2.2.202607",
      ["dotnet_version"] = Environment.Version.ToString(),
      ["extractor_commit"] = ExtractorBuildIdentity.ReadRepositoryCommit(),
      ["mappings_probe_asset"] = mappingsProbeAsset,
      ["mappings_usmap_sha256"] = Hashing.Sha256File(config.MappingsPath),
      ["pak_file_count"] = containerCounts.GetValueOrDefault(".pak"),
      ["server_app_id"] = config.ServerAppId,
      ["server_appmanifest_sha256"] = config.ServerAppmanifestSha256,
      ["server_build_id"] = config.ServerBuildId,
      ["server_game_version"] = config.ServerGameVersion,
      ["source_package_manifest_sha256"] = packageHash,
      ["status"] = "ok",
      ["ucas_file_count"] = containerCounts.GetValueOrDefault(".ucas"),
      ["utoc_file_count"] = containerCounts.GetValueOrDefault(".utoc"),
      ["windows_x64"] = true,
    };
  }

  private static string RequireMappingsCompatibleWithCurrentAssets(ExtractionConfig config)
  {
    try
    {
      using var provider = ProviderFactory.OpenReadOnly(config);
      var candidates = provider.Files
          .Where(pair => pair.Value.IsUePackage
              && pair.Value.NameWithoutExtension.Equals("DT_PalMonsterParameter", StringComparison.OrdinalIgnoreCase))
          .OrderBy(pair => pair.Key, StringComparer.Ordinal)
          .ToArray();
      foreach (var candidate in candidates)
      {
        var table = provider.LoadPackage(candidate.Value).GetExports().OfType<UDataTable>().FirstOrDefault();
        if (table is not null
            && table.RowMap.Count > 0
            && table.RowMap.Values.SelectMany(row => row.Properties).Any())
        {
          return candidate.Key;
        }
      }
    }
    catch (Exception)
    {
      // Normalize all current-asset mapping probe failures to the required stable code.
    }

    throw new ExtractorException(
        ErrorCodes.MappingsVersionIncompatible,
        "Mappings.usmap could not parse the current Palworld character DataTable assets.");
  }

  private static void OpenReadOnly(string path)
  {
    try
    {
      using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read);
      _ = stream.Length;
    }
    catch (Exception error) when (error is IOException or UnauthorizedAccessException)
    {
      throw new ExtractorException(ErrorCodes.InputNotReadable, $"An extractor input cannot be opened read-only: {Path.GetFileName(path)}");
    }
  }

  private static void Require(bool condition, string code, string message)
  {
    if (!condition)
    {
      throw new ExtractorException(code, message);
    }
  }
}
