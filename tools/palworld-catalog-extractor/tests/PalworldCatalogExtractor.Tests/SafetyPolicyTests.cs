using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Discovery;
using PalHatchHelper.CatalogExtractor.Doctor;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class SafetyPolicyTests
{
  [Fact]
  public void InventoryPolicyRejectsBinaryPayloadFields()
  {
    InventorySafetyPolicy.Validate(new JsonObject
    {
      ["virtual_asset_path"] = "Pal/Content/Fixture.uasset",
      ["property_type"] = "SoftObjectProperty",
    });
    var error = Assert.Throws<ExtractorException>(() => InventorySafetyPolicy.Validate(
        new JsonObject { ["payload"] = Convert.ToBase64String([1, 2, 3]) }));
    Assert.Equal(ErrorCodes.AssetInventoryFailed, error.Code);
    Assert.Equal(6, InventorySafetyPolicy.AllowedOutputFiles.Count);
  }

  [Fact]
  public void OutputMustBeIgnoredAndUntracked()
  {
    using var repository = new TemporaryDirectory();
    RunGit(repository.Path, "init");
    RunGit(repository.Path, "config", "user.email", "fixture@example.invalid");
    RunGit(repository.Path, "config", "user.name", "Fixture");
    File.WriteAllText(Path.Combine(repository.Path, ".gitignore"), "ignored/\n");
    RunGit(repository.Path, "add", ".gitignore");
    RunGit(repository.Path, "commit", "-m", "fixture");

    var previous = Environment.CurrentDirectory;
    try
    {
      Environment.CurrentDirectory = repository.Path;
      GitOutputGuard.RequireIgnoredAndUntracked(Path.Combine(repository.Path, "ignored", "catalog"));
      var error = Assert.Throws<ExtractorException>(() =>
        GitOutputGuard.RequireIgnoredAndUntracked(Path.Combine(repository.Path, "visible", "catalog")));
      Assert.Equal(ErrorCodes.OutputNotIgnored, error.Code);

      var trackedOutput = Path.Combine(repository.Path, "ignored", "tracked");
      Directory.CreateDirectory(trackedOutput);
      File.WriteAllText(Path.Combine(trackedOutput, "committed.txt"), "fixture");
      RunGit(repository.Path, "add", "--force", "ignored/tracked/committed.txt");
      RunGit(repository.Path, "commit", "-m", "tracked output fixture");
      var trackedError = Assert.Throws<ExtractorException>(() =>
        GitOutputGuard.RequireIgnoredAndUntracked(trackedOutput));
      Assert.Equal(ErrorCodes.OutputTracked, trackedError.Code);
    }
    finally
    {
      Environment.CurrentDirectory = previous;
    }
  }

  private static void RunGit(string workingDirectory, params string[] arguments)
  {
    using var process = new System.Diagnostics.Process
    {
      StartInfo = new System.Diagnostics.ProcessStartInfo
      {
        FileName = "git",
        WorkingDirectory = workingDirectory,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
      },
    };
    foreach (var argument in arguments)
    {
      process.StartInfo.ArgumentList.Add(argument);
    }

    process.Start();
    process.WaitForExit();
    Assert.Equal(0, process.ExitCode);
  }
}
