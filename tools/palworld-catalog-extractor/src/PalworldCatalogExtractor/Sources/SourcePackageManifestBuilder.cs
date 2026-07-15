using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Sources;

public sealed record SourcePackageEntry(string RelativePath, long Size, string Sha256, string FileKind);

public static class SourcePackageManifestBuilder
{
  private static readonly Dictionary<string, string> ContainerKinds = new(StringComparer.OrdinalIgnoreCase)
  {
    [".pak"] = "pak",
    [".utoc"] = "utoc",
    [".ucas"] = "ucas",
  };

  public static JsonObject Build(ExtractionConfig config)
  {
    var entries = Directory.EnumerateFiles(config.PaksPath, "*", SearchOption.TopDirectoryOnly)
        .Where(path => ContainerKinds.ContainsKey(Path.GetExtension(path)))
        .Select(path => Entry(path, $"paks/{Path.GetFileName(path)}", ContainerKinds[Path.GetExtension(path)]))
        .Append(Entry(config.ClientAppmanifestPath, $"appmanifest/{Path.GetFileName(config.ClientAppmanifestPath)}", "client_appmanifest"))
        .Append(Entry(config.MappingsPath, "mappings/Mappings.usmap", "mappings_usmap"));
    return FromEntries(entries);
  }

  public static JsonObject FromEntries(IEnumerable<SourcePackageEntry> entries)
  {
    var files = new JsonArray();
    foreach (var entry in entries.OrderBy(value => value.RelativePath, StringComparer.Ordinal))
    {
      files.Add(new JsonObject
      {
        ["file_kind"] = entry.FileKind,
        ["relative_path"] = entry.RelativePath.Replace('\\', '/'),
        ["sha256"] = entry.Sha256,
        ["size"] = entry.Size,
      });
    }

    return new JsonObject
    {
      ["files"] = files,
      ["schema_version"] = "1.0.0",
    };
  }

  public static string ComputePackageHash(JsonObject manifest) => Hashing.Sha256(DeterministicJson.Serialize(manifest));

  private static SourcePackageEntry Entry(string path, string relativePath, string kind)
  {
    var info = new FileInfo(path);
    return new SourcePackageEntry(relativePath, info.Length, Hashing.Sha256File(path), kind);
  }
}
