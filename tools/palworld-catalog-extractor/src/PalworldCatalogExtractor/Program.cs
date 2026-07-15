using System.Diagnostics;
using System.Reflection;
using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Discovery;
using PalHatchHelper.CatalogExtractor.Doctor;
using PalHatchHelper.CatalogExtractor.Pipeline;
using PalHatchHelper.CatalogExtractor.Readers;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor;

public static class Program
{
  public static async Task<int> Main(string[] args)
  {
    try
    {
      if (args.Length != 3 || args[1] != "--config")
      {
        throw new ExtractorException(
            ErrorCodes.ConfigurationInvalid,
            "Usage: palworld-catalog-extractor <doctor|inventory|extract|verify|package> --config <path>");
      }

      var config = ExtractionConfig.Load(args[2]);
      JsonNode result = args[0] switch
      {
        "doctor" => DoctorRunner.Run(config),
        "inventory" => AssetInventoryRunner.Run(config),
        "extract" => await ExtractAsync(config).ConfigureAwait(false),
        "verify" => CatalogVerifier.Verify(config.OutputPath),
        "package" => Package(config.OutputPath),
        _ => throw new ExtractorException(ErrorCodes.ConfigurationInvalid, "Unknown extractor command."),
      };
      Console.Out.WriteLine(DeterministicJson.Serialize(result));
      return 0;
    }
    catch (ExtractorException error)
    {
      Console.Error.WriteLine(DeterministicJson.Serialize(new JsonObject
      {
        ["error_code"] = error.Code,
        ["message"] = error.Message,
        ["status"] = "failed",
      }));
      return 2;
    }
    catch (Exception)
    {
      Console.Error.WriteLine(DeterministicJson.Serialize(new JsonObject
      {
        ["error_code"] = ErrorCodes.AssetInventoryFailed,
        ["message"] = "The command failed without exposing input data.",
        ["status"] = "failed",
      }));
      return 3;
    }
  }

  private static async Task<JsonNode> ExtractAsync(ExtractionConfig config)
  {
    _ = DoctorRunner.Run(config);
    var client = SteamAppManifestReader.Read(config.ClientAppmanifestPath);
    _ = CompatibilityEvaluator.RequireExact(config, client);
    var sourceManifest = SourcePackageManifestBuilder.Build(config);
    var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
    var provenance = new SourceProvenance(
        ReadRepositoryCommit(),
        Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unversioned",
        client.AppId,
        client.BuildId,
        Hashing.Sha256File(config.ClientAppmanifestPath),
        config.ClientGameVersion,
        config.ServerAppId,
        config.ServerBuildId,
        config.ServerAppmanifestSha256,
        config.ServerGameVersion,
        Hashing.Sha256File(config.MappingsPath),
        packageHash,
        DateTimeOffset.UtcNow);
    try
    {
      var result = await new CatalogExtractionPipeline(ProductionReaderSet.Create()).ExtractAsync(
          new ExtractionRequest(
              config.OutputPath,
              config.ServerBuildId,
              config.ServerGameVersion,
              sourceManifest,
              provenance,
              config.Locales),
          CancellationToken.None).ConfigureAwait(false);
      return new JsonObject { ["content_hash"] = result.ContentHash, ["status"] = "extracted" };
    }
    catch (ExtractorException error) when (error.Code == ErrorCodes.UnresolvedGameFacts)
    {
      throw new ExtractorException(
          ErrorCodes.WindowsAssetExtractionRequired,
          "Run Windows inventory and complete the audited asset-field confirmation before extraction.");
    }
  }

  private static JsonObject Package(string outputPath)
  {
    GitOutputGuard.RequireIgnoredAndUntracked(outputPath);
    var path = CatalogPackager.Package(outputPath);
    return new JsonObject { ["package_path"] = path, ["status"] = "packaged" };
  }

  private static string ReadRepositoryCommit()
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
