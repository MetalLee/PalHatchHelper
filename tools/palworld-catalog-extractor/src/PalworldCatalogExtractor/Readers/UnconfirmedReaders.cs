using PalHatchHelper.CatalogExtractor.Contracts;

namespace PalHatchHelper.CatalogExtractor.Readers;

public abstract class UnconfirmedReader(CatalogCategory category) : ICatalogReader
{
  public CatalogCategory Category { get; } = category;

  public Task<ReaderResult> ReadAsync(CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    var definition = CatalogCategories.Definition(Category);
    return Task.FromResult(new ReaderResult(
        [],
        [],
        [],
        [new UnresolvedRecord(definition.CountField, "inventory_confirmation_required", "SOURCE_FIELDS_NOT_CONFIRMED")],
        []));
  }
}

public sealed class UnconfirmedPalReader() : UnconfirmedReader(CatalogCategory.Pals), IPalReader;

public sealed class UnconfirmedPassiveSkillReader() : UnconfirmedReader(CatalogCategory.PassiveSkills), IPassiveSkillReader;

public sealed class UnconfirmedActiveSkillReader() : UnconfirmedReader(CatalogCategory.ActiveSkills), IActiveSkillReader;

public sealed class UnconfirmedPalActiveSkillReader() : UnconfirmedReader(CatalogCategory.PalActiveSkills), IPalActiveSkillReader;

public sealed class UnconfirmedPartnerSkillReader() : UnconfirmedReader(CatalogCategory.PartnerSkills), IPartnerSkillReader;

public sealed class UnconfirmedBreedingRecipeReader() : UnconfirmedReader(CatalogCategory.BreedingRecipes), IBreedingRecipeReader;

public sealed class UnconfirmedLocalizationReader() : UnconfirmedReader(CatalogCategory.Localizations), ILocalizationReader;

public static class ProductionReaderSet
{
  public static ICatalogReader[] Create() =>
  [
      new UnconfirmedPalReader(),
        new UnconfirmedPassiveSkillReader(),
        new UnconfirmedActiveSkillReader(),
        new UnconfirmedPalActiveSkillReader(),
        new UnconfirmedPartnerSkillReader(),
        new UnconfirmedBreedingRecipeReader(),
        new UnconfirmedLocalizationReader(),
    ];
}
