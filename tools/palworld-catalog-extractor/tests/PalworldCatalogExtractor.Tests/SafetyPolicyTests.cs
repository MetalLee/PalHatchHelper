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
    Assert.Equal(7, InventorySafetyPolicy.AllowedOutputFiles.Count);
  }

  [Theory]
  [InlineData("SoftObjectProperty", "soft_object")]
  [InlineData("SoftClassProperty", "soft_class")]
  [InlineData("NameProperty", "name")]
  [InlineData("TextProperty", "text")]
  [InlineData("EnumProperty", "enum")]
  [InlineData("ArrayProperty", "array")]
  [InlineData("MapProperty", "map")]
  [InlineData("StructProperty", "struct")]
  public void InventoryDescribesEveryRequiredUnrealRelationship(
      string propertyType,
      string expectedKind)
  {
    var descriptor = InventoryPropertyShape.Describe(
        propertyType,
        innerType: "StructProperty",
        valueType: "SoftObjectProperty",
        structType: "FixtureStruct",
        enumType: "FixtureEnum",
        referenceTarget: "/Game/Fixture.Target");

    Assert.Equal(expectedKind, descriptor["relationship_kind"]!.GetValue<string>());
    InventorySafetyPolicy.Validate(descriptor);
  }

  [Fact]
  public void BlueprintDiscoveryDoesNotDropUnscoredCdosOrComponents()
  {
    Assert.True(AssetInventoryRunner.IsBlueprintDiscoveryObject("Default__BP_Fixture_C", "BlueprintGeneratedClass"));
    Assert.True(AssetInventoryRunner.IsBlueprintDiscoveryObject("FixtureComponent", "SceneComponent"));
  }

  [Fact]
  public void SyntheticInventoryWritesOnlyAuditedStructuralDocuments()
  {
    using var output = new TemporaryDirectory();
    var descriptor = InventoryPropertyShape.Describe(
        "MapProperty",
        innerType: "NameProperty",
        valueType: "SoftObjectProperty",
        structType: null,
        enumType: null,
        referenceTarget: "/Game/Fixture.Target");

    AssetInventoryRunner.WriteInventories(
        output.Path,
        new JsonArray(new JsonObject
        {
          ["candidate_score"] = 0,
          ["package_name"] = "Fixture",
          ["virtual_asset_path"] = "Pal/Content/Fixture.uasset",
        }),
        new JsonArray(new JsonObject
        {
          ["data_table_name"] = "FixtureTable",
          ["fields"] = new JsonArray(descriptor),
          ["row_struct_type"] = "FixtureRow",
        }),
        new JsonArray(new JsonObject
        {
          ["export_name"] = "Default__BP_Fixture_C",
          ["properties"] = new JsonArray(descriptor.DeepClone()),
        }),
        new JsonArray(),
        new JsonArray(),
        new Dictionary<string, string>(StringComparer.Ordinal) { ["/Game"] = "Pal/Content" });

    var actualFiles = Directory.EnumerateFiles(output.Path)
        .Select(Path.GetFileName)
        .Order(StringComparer.Ordinal)
        .ToArray();
    var expectedFiles = InventorySafetyPolicy.AllowedOutputFiles
        .Where(file => file is not "source-package-manifest.json" and not ExtractionEvidenceGuard.EvidenceManifestFileName)
        .Order(StringComparer.Ordinal)
        .ToArray();
    Assert.Equal(expectedFiles, actualFiles);
    foreach (var file in actualFiles)
    {
      InventorySafetyPolicy.Validate(JsonNode.Parse(File.ReadAllText(Path.Combine(output.Path, file!)))!);
    }
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
