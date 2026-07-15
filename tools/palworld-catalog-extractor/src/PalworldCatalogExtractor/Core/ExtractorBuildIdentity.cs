using System.Diagnostics;

namespace PalHatchHelper.CatalogExtractor.Core;

public static class ExtractorBuildIdentity
{
  public static string ReadRepositoryCommit()
  {
    using var process = new Process
    {
      StartInfo = new ProcessStartInfo
      {
        FileName = "git",
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true,
      },
    };
    process.StartInfo.ArgumentList.Add("rev-parse");
    process.StartInfo.ArgumentList.Add("HEAD");
    try
    {
      process.Start();
      var value = process.StandardOutput.ReadToEnd().Trim();
      process.WaitForExit();
      if (process.ExitCode == 0 && value.Length == 40)
      {
        return value;
      }
    }
    catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException)
    {
      // Report a stable explicit build identity instead of emitting environment details.
    }

    return "uncommitted-extractor-build";
  }
}
