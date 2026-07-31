using System.Formats.Tar;
using System.Text.Json.Nodes;
using ZstdSharp;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Pipeline;
using PalHatchHelper.CatalogExtractor.Readers;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class CatalogPipelineTests
{
  [Fact]
  public void ContentHashIncludesTheCatalogSchemaVersion()
  {
    CatalogFileHash[] files =
    [
        new("items.jsonl", new string('a', 64), 1),
    ];

    Assert.Equal(
        "ace38fae0c70c845c4400d9d7b29c4841a6777378de60114e9d3f27187c0f62b",
        Hashing.ComputeContentHash(CatalogCategories.SchemaVersion, files));
    Assert.NotEqual(
        Hashing.ComputeContentHash("1.1.0", files),
        Hashing.ComputeContentHash(CatalogCategories.SchemaVersion, files));
  }

  [Fact]
  public void SharedSchemaAcceptsFiniteSinglePrecisionNumbers()
  {
    SharedCatalogSchemaValidator.ValidateDefinition(
        new JsonObject
        {
          ["slot"] = 1,
          ["target_type"] = "pal",
          ["effect_type"] = "defense",
          ["value"] = 12.5f,
          ["target_element_type"] = null,
        },
        "CatalogPassiveEffect");
  }

  [Fact]
  public async Task SyntheticNineReaderRunIsSortedAndContentReproducible()
  {
    using var first = new TemporaryDirectory();
    using var second = new TemporaryDirectory();
    var readers = SyntheticReaders.Valid();
    var request = SyntheticReaders.Request(first.Path);

    var firstResult = await new CatalogExtractionPipeline(readers).ExtractAsync(request, CancellationToken.None);
    var secondResult = await new CatalogExtractionPipeline(SyntheticReaders.Valid(reverse: true)).ExtractAsync(
        request with { OutputPath = second.Path }, CancellationToken.None);

    Assert.Equal(firstResult.ContentHash, secondResult.ContentHash);
    Assert.Equal(File.ReadAllBytes(Path.Combine(first.Path, "pals.jsonl")), File.ReadAllBytes(Path.Combine(second.Path, "pals.jsonl")));
    Assert.Equal(9, firstResult.Counts.Count);
    Assert.All(firstResult.Counts.Values, count => Assert.True(count > 0));
    CatalogVerifier.Verify(first.Path);
  }

  [Fact]
  public async Task MissingOrEmptyCategoryPreservesTheFullCatalogGate()
  {
    using var output = new TemporaryDirectory();
    var missing = SyntheticReaders.Valid().Where(reader => reader.Category != CatalogCategory.PartnerSkills).ToArray();
    var missingError = await Assert.ThrowsAsync<ExtractorException>(
        () => new CatalogExtractionPipeline(missing).ExtractAsync(SyntheticReaders.Request(output.Path), CancellationToken.None));
    Assert.Equal(ErrorCodes.FullCatalogReaderMissing, missingError.Code);

    var empty = SyntheticReaders.Valid().Select(
        reader => reader.Category == CatalogCategory.PartnerSkills ? new FixtureReader(reader.Category, []) : reader).ToArray();
    var emptyError = await Assert.ThrowsAsync<ExtractorException>(
        () => new CatalogExtractionPipeline(empty).ExtractAsync(SyntheticReaders.Request(output.Path), CancellationToken.None));
    Assert.Equal(ErrorCodes.FullCatalogCategoryEmpty, emptyError.Code);
  }

  [Fact]
  public async Task UnresolvedFactsAreNeverSilentlyDiscarded()
  {
    using var output = new TemporaryDirectory();
    var readers = SyntheticReaders.Valid().Select(
        reader => reader.Category == CatalogCategory.Pals
            ? new UnresolvedFixtureReader(reader)
            : reader).ToArray();

    var error = await Assert.ThrowsAsync<ExtractorException>(
        () => new CatalogExtractionPipeline(readers).ExtractAsync(SyntheticReaders.Request(output.Path), CancellationToken.None));

    Assert.Equal(ErrorCodes.UnresolvedGameFacts, error.Code);
    Assert.False(File.Exists(Path.Combine(output.Path, "manifest.json")));
  }

  [Theory]
  [InlineData("missing-pal", ErrorCodes.CatalogReferenceInvalid)]
  [InlineData("missing-localization", ErrorCodes.CatalogLocalizationReferenceInvalid)]
  public async Task BrokenReferencesAndLocalizationsFail(string mutation, string expectedCode)
  {
    using var output = new TemporaryDirectory();
    var readers = SyntheticReaders.Valid(mutation: mutation);
    var error = await Assert.ThrowsAsync<ExtractorException>(
        () => new CatalogExtractionPipeline(readers).ExtractAsync(SyntheticReaders.Request(output.Path), CancellationToken.None));
    Assert.Equal(expectedCode, error.Code);
  }

  [Fact]
  public async Task PackageContainsOnlyTheAuditedAllowlist()
  {
    using var output = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(output.Path), CancellationToken.None);
    File.WriteAllBytes(Path.Combine(output.Path, "forbidden.pak"), [1, 2, 3]);

    var forbiddenError = Assert.Throws<ExtractorException>(() => CatalogPackager.Package(output.Path));
    Assert.Equal(ErrorCodes.PackageForbiddenFile, forbiddenError.Code);

    File.Delete(Path.Combine(output.Path, "forbidden.pak"));
    var packagePath = CatalogPackager.Package(output.Path);
    var firstPackage = File.ReadAllBytes(packagePath);
    Thread.Sleep(TimeSpan.FromSeconds(1.1));
    Assert.Equal(packagePath, CatalogPackager.Package(output.Path));
    Assert.Equal(firstPackage, File.ReadAllBytes(packagePath));

    Assert.EndsWith(".tar.zst", packagePath, StringComparison.Ordinal);
    Assert.DoesNotContain("forbidden.pak", CatalogPackager.ListSourceFiles(output.Path));
    Assert.All(CatalogPackager.ListSourceFiles(output.Path), path => Assert.DoesNotContain(Path.GetExtension(path), CatalogPackager.ForbiddenExtensions));

    using var package = File.OpenRead(packagePath);
    using var decompressor = new DecompressionStream(package);
    using var tar = new TarReader(decompressor);
    var members = new List<string>();
    while (tar.GetNextEntry() is { } entry)
    {
      members.Add(entry.Name);
    }

    Assert.Equal(CatalogPackager.ListSourceFiles(output.Path), members);
  }

  [Fact]
  public async Task VerifyRequiresEvidenceForTheExactNormalizedRecordKeys()
  {
    using var output = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(output.Path), CancellationToken.None);
    var evidencePath = Path.Combine(output.Path, "source-evidence.json");
    var evidence = JsonNode.Parse(File.ReadAllText(evidencePath))!.AsObject();
    evidence["categories"]!["pals"]![0]!["record_key"] = "unrelated-record";
    DeterministicJson.WriteFile(evidencePath, evidence);

    var error = Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(output.Path));

    Assert.Equal(ErrorCodes.CatalogSourceEvidenceInvalid, error.Code);
  }

  [Fact]
  public async Task VerifyRejectsUnsortedSetSemanticArrays()
  {
    using var output = new TemporaryDirectory();
    var readers = SyntheticReaders.Valid(mutation: "unsorted-set");

    var error = await Assert.ThrowsAsync<ExtractorException>(
        () => new CatalogExtractionPipeline(readers).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));

    Assert.Equal(ErrorCodes.CatalogOrderInvalid, error.Code);
  }

  [Fact]
  public async Task ExtractorExecutesSharedRecordSchemaWithoutAllowingUndeclaredFields()
  {
    using var output = new TemporaryDirectory();
    var error = await Assert.ThrowsAsync<ExtractorException>(() =>
        new CatalogExtractionPipeline(SyntheticReaders.Valid(mutation: "unknown-field")).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));

    Assert.Equal(ErrorCodes.CatalogSchemaInvalid, error.Code);
  }

  [Fact]
  public async Task VerifyFailsWhenAnyOfSevenNormalizedFilesIsMissing()
  {
    using var output = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(output.Path), CancellationToken.None);
    File.Delete(Path.Combine(output.Path, "partner-skills.jsonl"));

    var error = Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(output.Path));

    Assert.Equal(ErrorCodes.CatalogFileMissing, error.Code);
  }

  [Theory]
  [InlineData("counts")]
  [InlineData("checksums")]
  [InlineData("provenance")]
  public async Task VerifyRejectsTamperedManifestAndSidecars(string mutation)
  {
    using var output = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(output.Path), CancellationToken.None);

    if (mutation == "checksums")
    {
      File.WriteAllText(Path.Combine(output.Path, "checksums.sha256"), $"{new string('0', 64)}  pals.jsonl\n");
    }
    else
    {
      var manifestPath = Path.Combine(output.Path, "manifest.json");
      var manifest = JsonNode.Parse(File.ReadAllText(manifestPath))!.AsObject();
      if (mutation == "counts")
      {
        manifest["counts"]!["pals"] = 999;
      }
      else
      {
        manifest["source_provenance"]!.AsObject().Remove("upstream_license");
      }

      DeterministicJson.WriteFile(manifestPath, manifest);
    }

    Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(output.Path));
  }

  [Fact]
  public async Task VerifyRejectsParentPairsThatAreNotCanonicallyOrdered()
  {
    using var output = new TemporaryDirectory();
    var error = await Assert.ThrowsAsync<ExtractorException>(() =>
        new CatalogExtractionPipeline(SyntheticReaders.Valid(mutation: "parent-order")).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));

    Assert.Equal(ErrorCodes.CatalogOrderInvalid, error.Code);
  }

  [Fact]
  public async Task ExtractionRequiresAuditedSourceMetadataAndCollisionSemantics()
  {
    using var output = new TemporaryDirectory();
    var metadataError = await Assert.ThrowsAsync<ExtractorException>(() =>
        new CatalogExtractionPipeline(SyntheticReaders.Valid(mutation: "missing-source-metadata")).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));
    Assert.Equal(ErrorCodes.CatalogSourceEvidenceInvalid, metadataError.Code);

    var collisionError = await Assert.ThrowsAsync<ExtractorException>(() =>
        new CatalogExtractionPipeline(SyntheticReaders.WithStableIdCollision()).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));
    Assert.Equal(ErrorCodes.GameIdNormalizationCollision, collisionError.Code);
  }

  [Fact]
  public async Task FailedExtractionDoesNotPublishPartialCatalogFiles()
  {
    using var output = new TemporaryDirectory();
    var inventoryPath = Path.Combine(output.Path, "asset-inventory.json");
    File.WriteAllText(inventoryPath, "{\"assets\":[]}\n");

    await Assert.ThrowsAsync<ExtractorException>(() =>
        new CatalogExtractionPipeline(SyntheticReaders.Valid(mutation: "missing-localization")).ExtractAsync(
            SyntheticReaders.Request(output.Path), CancellationToken.None));

    Assert.Equal("{\"assets\":[]}\n", File.ReadAllText(inventoryPath));
    Assert.False(File.Exists(Path.Combine(output.Path, "pals.jsonl")));
    Assert.False(Directory.EnumerateFileSystemEntries(
        Path.GetDirectoryName(output.Path)!, $".{Path.GetFileName(output.Path)}.*.tmp").Any());
  }

  [Fact]
  public async Task VerifyCanCompareTwoIndependentExtractionsOfTheSameSource()
  {
    using var first = new TemporaryDirectory();
    using var second = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(first.Path), CancellationToken.None);
    await new CatalogExtractionPipeline(SyntheticReaders.Valid(reverse: true)).ExtractAsync(
        SyntheticReaders.Request(second.Path), CancellationToken.None);

    var report = CatalogVerifier.Verify(first.Path, second.Path);
    Assert.Equal("identical", report["reproducibility_status"]!.GetValue<string>());
    var sameDirectoryError = Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(first.Path, first.Path));
    Assert.Equal(ErrorCodes.CatalogReproducibilityMismatch, sameDirectoryError.Code);

    using var different = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid(mutation: "different-content")).ExtractAsync(
        SyntheticReaders.Request(different.Path), CancellationToken.None);
    var error = Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(first.Path, different.Path));
    Assert.Equal(ErrorCodes.CatalogReproducibilityMismatch, error.Code);
  }

  [Fact]
  public void PalCalcLicenseIsPresent()
  {
    var license = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "LICENSE.palcalc.txt"));
    Assert.Contains("Copyright 2024, Tyler Camp", license, StringComparison.Ordinal);
    Assert.Contains("Permission is hereby granted", license, StringComparison.Ordinal);
  }
}

internal static class SyntheticReaders
{
  internal static ICatalogReader[] Valid(bool reverse = false, string? mutation = null)
  {
    var palA = Record("fixture-pal-a", "FixturePalA", new JsonObject
    {
      ["pal_id"] = "fixturepala",
      ["encyclopedia_no"] = 1,
      ["name_key"] = "pal.fixturepala.name",
      ["element_types"] = mutation == "unsorted-set"
          ? new JsonArray("neutral", "fire")
          : new JsonArray("neutral"),
      ["rarity"] = 1,
      ["breeding_power"] = 100,
    });
    if (mutation == "missing-source-metadata")
    {
      palA.Data["metadata"] = new JsonObject();
    }

    if (mutation == "different-content")
    {
      palA.Data["rarity"] = 3;
    }

    if (mutation == "unknown-field")
    {
      palA.Data["unreviewed_field"] = "not-in-shared-schema";
    }

    var palB = Record("fixture-pal-b", "FixturePalB", new JsonObject
    {
      ["pal_id"] = "fixturepalb",
      ["encyclopedia_no"] = 2,
      ["name_key"] = "pal.fixturepalb.name",
      ["element_types"] = new JsonArray("fire"),
      ["rarity"] = 2,
      ["breeding_power"] = 200,
    });
    var pals = reverse ? new[] { palB, palA } : new[] { palA, palB };
    var partnerPal = mutation == "missing-pal" ? "unknownpal" : "fixturepala";
    var localizations = new[]
    {
            Localization("pal.fixturepala.name"),
            Localization("pal.fixturepalb.name"),
            Localization("passive.fixture.name"),
            Localization("passive.fixture.description"),
            Localization("active.fixture.name"),
            Localization("partner.fixture.name"),
            Localization("partner.fixture.description"),
            Localization("item.fixture.name"),
            Localization("item.fixture.description"),
        }.Where(record => mutation != "missing-localization" || record.Data["text_key"]!.GetValue<string>() != "partner.fixture.name").ToArray();

    return
    [
        new FixtureReader(CatalogCategory.Pals, pals),
            new FixtureReader(CatalogCategory.PassiveSkills,
            [
                Record("passive", "FixturePassive", new JsonObject
                {
                    ["passive_skill_id"] = "fixturepassive",
                    ["name_key"] = "passive.fixture.name",
                    ["description_key"] = "passive.fixture.description",
                    ["rank"] = -1,
                    ["is_negative"] = true,
                }),
            ]),
            new FixtureReader(CatalogCategory.ActiveSkills,
            [
                Record("active", "FixtureActive", new JsonObject
                {
                    ["active_skill_id"] = "fixtureactive",
                    ["name_key"] = "active.fixture.name",
                    ["element_type"] = "fire",
                    ["power"] = 10,
                    ["cooldown_seconds"] = 2.5,
                }),
            ]),
            new FixtureReader(CatalogCategory.PalActiveSkills,
            [
                Record("pal-active", "FixturePalA.FixtureActive.1", new JsonObject
                {
                    ["pal_id"] = "fixturepala",
                    ["active_skill_id"] = "fixtureactive",
                    ["learn_level"] = 1,
                    ["is_exclusive"] = false,
                }),
            ]),
            new FixtureReader(CatalogCategory.PartnerSkills,
            [
                Record("partner", "FixturePartner", new JsonObject
                {
                    ["partner_skill_id"] = "fixturepartner",
                    ["pal_id"] = partnerPal,
                    ["name_key"] = "partner.fixture.name",
                    ["description_key"] = "partner.fixture.description",
                }),
            ]),
            new FixtureReader(CatalogCategory.BreedingRecipes,
            [
                Record("recipe", "FixtureRecipe", new JsonObject
                {
                    ["parent_a_pal_id"] = mutation == "parent-order" ? "fixturepalb" : "fixturepala",
                    ["parent_a_gender"] = "any",
                    ["parent_b_pal_id"] = mutation == "parent-order" ? "fixturepala" : "fixturepalb",
                    ["parent_b_gender"] = "any",
                    ["child_pal_id"] = "fixturepalb",
                    ["recipe_type"] = "normal",
                }),
            ]),
            new FixtureReader(CatalogCategory.Items,
            [
                Record("item", "FixtureItem", new JsonObject
                {
                    ["item_id"] = "fixtureitem",
                    ["name_key"] = "item.fixture.name",
                    ["description_key"] = "item.fixture.description",
                    ["type_a"] = "material",
                    ["type_b"] = "material",
                    ["max_stack_count"] = 9999,
                    ["enable_handcraft"] = true,
                    ["is_legal"] = true,
                    ["restore_health"] = 0,
                    ["restore_sanity"] = 0,
                    ["restore_satiety"] = 0,
                    ["corruption_factor"] = 0.0,
                }),
            ]),
            new FixtureReader(CatalogCategory.ItemRecipes,
            [
                Record("item-recipe", "FixtureItemRecipe", new JsonObject
                {
                    ["recipe_id"] = "fixtureitemrecipe",
                    ["product_item_id"] = "fixtureitem",
                    ["product_count"] = 1,
                    ["ingredients"] = new JsonArray
                    {
                      new JsonObject
                      {
                        ["slot"] = 1,
                        ["item_id"] = "fixtureitem",
                        ["count"] = 1,
                      },
                    },
                    ["craft_kind"] = "handcraft",
                    ["work_amount"] = 1.0,
                    ["workable_attribute"] = 0,
                    ["energy_type"] = null,
                    ["energy_amount"] = 0,
                    ["unlock_item_id"] = null,
                    ["deny_recipe_chain"] = new JsonArray(),
                }),
            ]),
            new FixtureReader(CatalogCategory.Localizations, localizations),
        ];
  }

  internal static ICatalogReader[] WithStableIdCollision()
  {
    var readers = Valid().ToList();
    var pals = readers.Single(reader => reader.Category == CatalogCategory.Pals);
    readers[readers.IndexOf(pals)] = new CollisionFixtureReader(pals);
    return readers.ToArray();
  }

  internal static ExtractionRequest Request(string outputPath)
  {
    var sourceManifest = SourcePackageManifestBuilder.FromEntries(
    [new("paks/Pal-Windows.pak", 10, new string('a', 64), "pak")]);
    return new ExtractionRequest(
        outputPath,
        "server-build",
        "v1.0.0",
        sourceManifest,
        new SourceProvenance(
            "fixture-extractor-commit",
            "tests",
            "1623730",
            "client-build",
            new string('b', 64),
            "v1.0.0",
            "2394010",
            "server-build",
            new string('c', 64),
            "v1.0.0",
            new string('d', 64),
            SourcePackageManifestBuilder.ComputePackageHash(sourceManifest),
            DateTimeOffset.Parse("2026-07-15T00:00:00Z", System.Globalization.CultureInfo.InvariantCulture)),
        ["en-US"]);
  }

  private static FixtureRecord Record(string key, string sourceId, JsonObject data)
  {
    data["metadata"] = new JsonObject { ["source_internal_name"] = sourceId };
    return new FixtureRecord(data, Evidence(key, sourceId));
  }

  private static FixtureRecord Localization(string key) => new(
      new JsonObject { ["locale"] = "en-US", ["text_key"] = key, ["text"] = $"Fixture {key}" },
      Evidence($"en-US\0{key}", key));

  private static SourceEvidenceRecord Evidence(string key, string sourceId) => new(
      key,
      sourceId,
      [new SourceLocation("Pal/Content/Fixture", "FixtureRow", "Fixture.Property")]);
}

internal sealed record FixtureRecord(JsonObject Data, SourceEvidenceRecord Evidence);

internal sealed class FixtureReader(
    CatalogCategory category,
    IReadOnlyList<FixtureRecord> records,
    IReadOnlyList<UnresolvedRecord>? unresolved = null) : ICatalogReader
{
  public CatalogCategory Category => category;

  public Task<ReaderResult> ReadAsync(CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(new ReaderResult(
        records.Select(record => (JsonObject)record.Data.DeepClone()).ToArray(),
        records.Select(record => record.Evidence with
        {
          RecordKey = CatalogCategories.RecordKey(category, record.Data),
        }).ToArray(),
        [],
        unresolved ?? [],
        []));
  }
}

internal sealed class UnresolvedFixtureReader(ICatalogReader inner) : ICatalogReader
{
  public CatalogCategory Category => inner.Category;

  public async Task<ReaderResult> ReadAsync(CancellationToken cancellationToken)
  {
    var result = await inner.ReadAsync(cancellationToken);
    return result with
    {
      UnresolvedRecords = [new UnresolvedRecord("pals", "candidate", "property_not_confirmed")],
    };
  }
}

internal sealed class CollisionFixtureReader(ICatalogReader inner) : ICatalogReader
{
  public CatalogCategory Category => inner.Category;

  public async Task<ReaderResult> ReadAsync(CancellationToken cancellationToken)
  {
    var result = await inner.ReadAsync(cancellationToken);
    var records = result.NormalizedRecords.Select(value => (JsonObject)value.DeepClone()).ToList();
    var evidence = result.SourceEvidenceRecords.ToList();
    var duplicate = (JsonObject)records[0].DeepClone();
    duplicate["encyclopedia_no"] = 99;
    records.Add(duplicate);
    evidence.Add(evidence[0] with { SourceInternalName = "fixturepala" });
    return result with { NormalizedRecords = records, SourceEvidenceRecords = evidence };
  }
}

internal sealed class TemporaryDirectory : IDisposable
{
  internal TemporaryDirectory()
  {
    Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"palhatch-extractor-{Guid.NewGuid():N}");
    Directory.CreateDirectory(Path);
  }

  internal string Path { get; }

  public void Dispose()
  {
    if (OperatingSystem.IsWindows())
    {
      foreach (var file in Directory.EnumerateFiles(Path, "*", SearchOption.AllDirectories))
      {
        File.SetAttributes(file, File.GetAttributes(file) & ~FileAttributes.ReadOnly);
      }
    }

    Directory.Delete(Path, true);
  }
}
