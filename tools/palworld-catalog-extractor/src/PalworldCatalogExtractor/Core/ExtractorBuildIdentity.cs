using System.Diagnostics;

namespace PalHatchHelper.CatalogExtractor.Core;

public static class ExtractorBuildIdentity
{
  public static string ReadRepositoryCommit()
  {
    try
    {
      var commit = RunGit("rev-parse", "HEAD");
      var status = RunGit("status", "--porcelain", "--untracked-files=all");
      return ResolveRepositoryIdentity(commit.Output, commit.ExitCode, status.Output, status.ExitCode);
    }
    catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException)
    {
      // Report a stable explicit build identity instead of emitting environment details.
      return "uncommitted-extractor-build";
    }
  }

  internal static string ResolveRepositoryIdentity(
      string commit,
      int commitExitCode,
      string status,
      int statusExitCode)
  {
    var value = commit.Trim();
    return commitExitCode == 0
        && statusExitCode == 0
        && string.IsNullOrWhiteSpace(status)
        && value.Length == 40
        && value.All(character => character is >= '0' and <= '9' or >= 'a' and <= 'f')
        ? value
        : "uncommitted-extractor-build";
  }

  private static GitResult RunGit(params string[] arguments)
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
    foreach (var argument in arguments)
    {
      process.StartInfo.ArgumentList.Add(argument);
    }

    process.Start();
    var output = process.StandardOutput.ReadToEnd();
    _ = process.StandardError.ReadToEnd();
    process.WaitForExit();
    return new GitResult(process.ExitCode, output);
  }

  private sealed record GitResult(int ExitCode, string Output);
}
