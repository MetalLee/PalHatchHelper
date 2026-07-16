using System.Diagnostics;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Doctor;

public static class GitOutputGuard
{
  public static void RequireIgnoredAndUntracked(string outputPath)
  {
    var fullOutputPath = Path.GetFullPath(outputPath);
    var containingRoot = FindContainingWorktreeRoot(fullOutputPath);
    var root = containingRoot is null
        ? RunGit(Environment.CurrentDirectory, ["rev-parse", "--show-toplevel"])
        : null;
    if (containingRoot is null && (root!.ExitCode != 0 || string.IsNullOrWhiteSpace(root.Output)))
    {
      throw new ExtractorException(ErrorCodes.OutputNotIgnored, "A Git worktree is required to audit the output path.");
    }

    var repositoryRoot = Path.GetFullPath(containingRoot ?? root!.Output.Trim());
    var relative = Path.GetRelativePath(repositoryRoot, fullOutputPath).Replace('\\', '/');
    if (relative == ".." || relative.StartsWith("../", StringComparison.Ordinal))
    {
      return;
    }

    var ignored = RunGit(repositoryRoot, ["check-ignore", "--no-index", "--quiet", "--", relative]);
    if (ignored.ExitCode != 0)
    {
      throw new ExtractorException(ErrorCodes.OutputNotIgnored, "The output path is not covered by Git ignore rules.");
    }

    var tracked = RunGit(repositoryRoot, ["ls-files", "--", relative]);
    if (tracked.ExitCode != 0 || !string.IsNullOrWhiteSpace(tracked.Output))
    {
      throw new ExtractorException(ErrorCodes.OutputTracked, "The output path contains Git-tracked files.");
    }
  }

  private static string? FindContainingWorktreeRoot(string outputPath)
  {
    var current = new DirectoryInfo(Directory.Exists(outputPath) ? outputPath : Path.GetDirectoryName(outputPath)!);
    while (current is not null)
    {
      var gitEntry = Path.Combine(current.FullName, ".git");
      if (Directory.Exists(gitEntry) || File.Exists(gitEntry))
      {
        return current.FullName;
      }

      current = current.Parent;
    }

    return null;
  }

  private static ProcessResult RunGit(string workingDirectory, IReadOnlyList<string> arguments)
  {
    using var process = new Process
    {
      StartInfo = new ProcessStartInfo
      {
        FileName = "git",
        WorkingDirectory = workingDirectory,
        RedirectStandardError = true,
        RedirectStandardOutput = true,
        UseShellExecute = false,
        CreateNoWindow = true,
      },
    };
    foreach (var argument in arguments)
    {
      process.StartInfo.ArgumentList.Add(argument);
    }

    try
    {
      process.Start();
      var output = process.StandardOutput.ReadToEnd();
      process.WaitForExit();
      return new ProcessResult(process.ExitCode, output);
    }
    catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException)
    {
      return new ProcessResult(-1, string.Empty);
    }
  }

  private sealed record ProcessResult(int ExitCode, string Output);
}
