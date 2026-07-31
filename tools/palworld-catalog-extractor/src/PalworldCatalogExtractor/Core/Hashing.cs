using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace PalHatchHelper.CatalogExtractor.Core;

public static class Hashing
{
  public static string Sha256(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

  public static string Sha256File(string path)
  {
    using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
  }

  public static string ComputeContentHash(string schemaVersion, IEnumerable<CatalogFileHash> files)
  {
    var values = new JsonArray();
    foreach (var file in files.OrderBy(value => value.FileName, StringComparer.Ordinal))
    {
      values.Add(new JsonObject
      {
        ["filename"] = file.FileName,
        ["record_count"] = file.RecordCount,
        ["sha256"] = file.Sha256,
      });
    }

    return Sha256(DeterministicJson.Serialize(new JsonObject
    {
      ["files"] = values,
      ["schema_version"] = schemaVersion,
    }));
  }
}

public sealed record CatalogFileHash(string FileName, string Sha256, int RecordCount);
