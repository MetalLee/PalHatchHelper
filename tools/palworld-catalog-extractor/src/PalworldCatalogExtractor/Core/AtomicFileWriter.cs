using System.Text;

namespace PalHatchHelper.CatalogExtractor.Core;

internal static class AtomicFileWriter
{
  public static void WriteUtf8(string path, Action<StreamWriter> write)
  {
    var fullPath = Path.GetFullPath(path);
    var parent = Path.GetDirectoryName(fullPath)!;
    Directory.CreateDirectory(parent);
    var temporary = Path.Combine(parent, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
    try
    {
      using (var stream = new FileStream(
                 temporary,
                 FileMode.CreateNew,
                 FileAccess.Write,
                 FileShare.None,
                 4096,
                 FileOptions.WriteThrough))
      {
        using (var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, leaveOpen: true))
        {
          write(writer);
          writer.Flush();
        }

        stream.Flush(flushToDisk: true);
      }

      File.Move(temporary, fullPath, overwrite: true);
    }
    finally
    {
      File.Delete(temporary);
    }
  }
}
