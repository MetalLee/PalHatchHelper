using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Pipeline;
using PalHatchHelper.CatalogExtractor.Readers;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class CatalogPipelineTests
{
  [Fact]
  public async Task SyntheticSevenReaderRunIsSortedAndContentReproducible()
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
    Assert.Equal(7, firstResult.Counts.Count);
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

    Assert.EndsWith(".tar.zst", packagePath, StringComparison.Ordinal);
    Assert.DoesNotContain("forbidden.pak", CatalogPackager.ListSourceFiles(output.Path));
    Assert.All(CatalogPackager.ListSourceFiles(output.Path), path => Assert.DoesNotContain(Path.GetExtension(path), CatalogPackager.ForbiddenExtensions));
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
  public async Task VerifyFailsWhenAnyOfSevenNormalizedFilesIsMissing()
  {
    using var output = new TemporaryDirectory();
    await new CatalogExtractionPipeline(SyntheticReaders.Valid()).ExtractAsync(
        SyntheticReaders.Request(output.Path), CancellationToken.None);
    File.Delete(Path.Combine(output.Path, "partner-skills.jsonl"));

    var error = Assert.Throws<ExtractorException>(() => CatalogVerifier.Verify(output.Path));

    Assert.Equal(ErrorCodes.CatalogFileMissing, error.Code);
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
                    ["rank"] = 1,
                    ["is_negative"] = false,
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
                    ["parent_a_pal_id"] = "fixturepala",
                    ["parent_b_pal_id"] = "fixturepalb",
                    ["child_pal_id"] = "fixturepalb",
                    ["recipe_type"] = "normal",
                }),
            ]),
            new FixtureReader(CatalogCategory.Localizations, localizations),
        ];
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

internal sealed class TemporaryDirectory : IDisposable
{
  internal TemporaryDirectory()
  {
    Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"palhatch-extractor-{Guid.NewGuid():N}");
    Directory.CreateDirectory(Path);
  }

  internal string Path { get; }

  public void Dispose() => Directory.Delete(Path, true);
}
