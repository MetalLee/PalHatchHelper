using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Discovery;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

internal sealed class AtomicCatalogDirectory : IDisposable
{
  private readonly string _destination;
  private bool _published;

  private AtomicCatalogDirectory(string destination, string stagingPath)
  {
    _destination = destination;
    StagingPath = stagingPath;
  }

  public string StagingPath { get; }

  public static AtomicCatalogDirectory Begin(string destination)
  {
    var fullDestination = Path.GetFullPath(destination);
    var parent = Path.GetDirectoryName(fullDestination)
        ?? throw new ExtractorException(ErrorCodes.CatalogOutputUnsafe, "The catalog output path has no parent directory.");
    Directory.CreateDirectory(parent);
    var staging = Path.Combine(parent, $".{Path.GetFileName(fullDestination)}.{Guid.NewGuid():N}.tmp");
    Directory.CreateDirectory(staging);
    var transaction = new AtomicCatalogDirectory(fullDestination, staging);
    try
    {
      transaction.CopyAuditedExistingFiles();
      return transaction;
    }
    catch
    {
      transaction.Dispose();
      throw;
    }
  }

  public void Publish()
  {
    var parent = Path.GetDirectoryName(_destination)!;
    var backup = Path.Combine(parent, $".{Path.GetFileName(_destination)}.{Guid.NewGuid():N}.backup");
    var movedExisting = false;
    try
    {
      if (Directory.Exists(_destination))
      {
        Directory.Move(_destination, backup);
        movedExisting = true;
      }

      Directory.Move(StagingPath, _destination);
      _published = true;
    }
    catch
    {
      if (movedExisting && !Directory.Exists(_destination) && Directory.Exists(backup))
      {
        Directory.Move(backup, _destination);
      }

      throw;
    }
    finally
    {
      if (_published && Directory.Exists(backup))
      {
        try
        {
          Directory.Delete(backup, recursive: true);
        }
        catch (IOException)
        {
          // A hidden complete backup is safer than turning a successful publish into a false failure.
        }
        catch (UnauthorizedAccessException)
        {
          // A hidden complete backup is safer than turning a successful publish into a false failure.
        }
      }
    }
  }

  public void Dispose()
  {
    if (!_published && Directory.Exists(StagingPath))
    {
      Directory.Delete(StagingPath, recursive: true);
    }
  }

  private void CopyAuditedExistingFiles()
  {
    if (!Directory.Exists(_destination))
    {
      return;
    }

    var allowed = InventorySafetyPolicy.AllowedOutputFiles
        .Concat(CatalogPackager.AllowedFileNames)
        .ToHashSet(StringComparer.Ordinal);
    foreach (var entry in Directory.EnumerateFileSystemEntries(_destination, "*", SearchOption.TopDirectoryOnly))
    {
      if (Directory.Exists(entry)
          || File.GetAttributes(entry).HasFlag(FileAttributes.ReparsePoint)
          || !allowed.Contains(Path.GetFileName(entry)))
      {
        throw new ExtractorException(
            ErrorCodes.CatalogOutputUnsafe,
            "The catalog output directory contains an unaudited file, directory, or link.");
      }

      File.Copy(entry, Path.Combine(StagingPath, Path.GetFileName(entry)), overwrite: false);
    }
  }
}
