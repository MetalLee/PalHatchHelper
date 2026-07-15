using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;

namespace PalHatchHelper.CatalogExtractor.Readers;

public sealed record ReaderResult(
    IReadOnlyList<JsonObject> NormalizedRecords,
    IReadOnlyList<SourceEvidenceRecord> SourceEvidenceRecords,
    IReadOnlyList<ExcludedRecord> ExcludedRecords,
    IReadOnlyList<UnresolvedRecord> UnresolvedRecords,
    IReadOnlyList<ReaderWarning> Warnings);

public interface ICatalogReader
{
  CatalogCategory Category { get; }

  Task<ReaderResult> ReadAsync(CancellationToken cancellationToken);
}

public interface IPalReader : ICatalogReader;

public interface IPassiveSkillReader : ICatalogReader;

public interface IActiveSkillReader : ICatalogReader;

public interface IPalActiveSkillReader : ICatalogReader;

public interface IPartnerSkillReader : ICatalogReader;

public interface IBreedingRecipeReader : ICatalogReader;

public interface ILocalizationReader : ICatalogReader;
