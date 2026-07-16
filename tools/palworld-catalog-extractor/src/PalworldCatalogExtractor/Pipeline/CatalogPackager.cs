using System.Formats.Tar;
using ZstdSharp;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

public static class CatalogPackager
{
  public static readonly IReadOnlySet<string> ForbiddenExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".pak", ".utoc", ".ucas", ".uasset", ".uexp", ".ubulk", ".umap", ".usmap", ".png", ".jpg", ".jpeg", ".wav", ".ogg", ".mp3",
    };

  public static readonly IReadOnlySet<string> AllowedFileNames = new HashSet<string>(StringComparer.Ordinal)
    {
        "manifest.json",
        "pals.jsonl",
        "passive-skills.jsonl",
        "active-skills.jsonl",
        "pal-active-skills.jsonl",
        "partner-skills.jsonl",
        "breeding-recipes.jsonl",
        "localizations.jsonl",
        "validation-report.json",
        "checksums.sha256",
        "source-evidence.json",
        "source-package-manifest.json",
        "extraction-summary.json",
    };

  public static IReadOnlyList<string> ListSourceFiles(string directory) => AllowedFileNames
      .Where(file => File.Exists(Path.Combine(directory, file)))
      .Order(StringComparer.Ordinal)
      .ToArray();

  public static string Package(string directory)
  {
    CatalogVerifier.Verify(directory);
    if (Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)
        .Any(file => ForbiddenExtensions.Contains(Path.GetExtension(file))))
    {
      throw new ExtractorException(ErrorCodes.PackageForbiddenFile, "The output directory contains a forbidden game asset or media file.");
    }

    var files = ListSourceFiles(directory);
    if (files.Count != AllowedFileNames.Count || files.Any(file => ForbiddenExtensions.Contains(Path.GetExtension(file))))
    {
      throw new ExtractorException(ErrorCodes.PackageForbiddenFile, "The package source set is incomplete or contains a forbidden file.");
    }

    var manifest = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(Path.Combine(directory, "manifest.json")))!.AsObject();
    var buildId = SafeFilePart(manifest["game_build_id"]!.GetValue<string>());
    var hash = manifest["content_hash"]!.GetValue<string>();
    var destination = Path.Combine(directory, $"palworld-catalog-{buildId}-{hash[..12]}.tar.zst");
    var temporary = Path.Combine(directory, $".{Path.GetFileName(destination)}.{Guid.NewGuid():N}.tmp");
    using var tarBuffer = new MemoryStream();
    using (var tar = new TarWriter(tarBuffer, TarEntryFormat.Ustar, leaveOpen: true))
    {
      foreach (var file in files)
      {
        using var data = File.Open(Path.Combine(directory, file), FileMode.Open, FileAccess.Read, FileShare.Read);
        var entry = new UstarTarEntry(TarEntryType.RegularFile, file)
        {
          DataStream = data,
          Gid = 0,
          GroupName = string.Empty,
          ModificationTime = DateTimeOffset.UnixEpoch,
          Mode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead,
          Uid = 0,
          UserName = string.Empty,
        };
        tar.WriteEntry(entry);
      }
    }

    tarBuffer.Position = 0;
    try
    {
      using (var output = new FileStream(
                 temporary,
                 FileMode.CreateNew,
                 FileAccess.Write,
                 FileShare.None,
                 4096,
                 FileOptions.WriteThrough))
      {
        using (var compressor = new CompressionStream(output, 10, leaveOpen: true))
        {
          tarBuffer.CopyTo(compressor);
        }

        output.Flush(flushToDisk: true);
      }

      if (File.Exists(destination))
      {
        if (Hashing.Sha256File(destination) != Hashing.Sha256File(temporary))
        {
          throw new ExtractorException(
              ErrorCodes.CatalogReproducibilityMismatch,
              "An existing package for this content hash is not byte-for-byte reproducible.");
        }

        return destination;
      }

      File.Move(temporary, destination);
      return destination;
    }
    finally
    {
      File.Delete(temporary);
    }
  }

  private static string SafeFilePart(string value)
  {
    var safe = new string(value.Where(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.').ToArray());
    return safe.Length == 0 ? "unknown" : safe;
  }
}
