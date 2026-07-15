using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using CUE4Parse.MappingsProvider.Usmap;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Doctor;

public static class DoctorRunner
{
  private const long MinimumFreeBytes = 10L * 1024 * 1024 * 1024;

  public static JsonObject Run(ExtractionConfig config)
  {
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
    var compatibility = CompatibilityEvaluator.RequireExact(config, appManifest);
    return new JsonObject
    {
      ["client_app_id"] = appManifest.AppId,
      ["client_build_id"] = appManifest.BuildId,
      ["client_last_updated"] = appManifest.LastUpdatedIso8601,
      ["compatibility_status"] = compatibility.Status,
      ["dotnet_version"] = Environment.Version.ToString(),
      ["status"] = "ok",
      ["windows_x64"] = true,
    };
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
