using PalHatchHelper.CatalogExtractor.Readers;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class ConfirmedReaderNormalizationTests
{
  [Fact]
  public void InventoryConfirmedEnumAndGenderValuesNormalizeWithoutGuessing()
  {
    Assert.Equal("Earth", ConfirmedCatalogReaders.EnumTail("EPalElementType::Earth"));
    Assert.Equal("any", ConfirmedCatalogReaders.Gender("EPalGenderType::None"));
    Assert.Equal("female", ConfirmedCatalogReaders.Gender("EPalGenderType::Female"));
    Assert.Equal("male", ConfirmedCatalogReaders.Gender("EPalGenderType::Male"));
  }

  [Fact]
  public void InvalidRawLocalizationCharactersAreDeterministicAndCollisionResistant()
  {
    var first = ConfirmedCatalogReaders.LocalizationKey("skill_name", "PASSIVE_CraftSpeed*3");
    var second = ConfirmedCatalogReaders.LocalizationKey("skill_name", "PASSIVE_CraftSpeed/3");

    Assert.Matches("^[A-Za-z0-9][A-Za-z0-9._-]*$", first);
    Assert.Equal(first, ConfirmedCatalogReaders.LocalizationKey("skill_name", "PASSIVE_CraftSpeed*3"));
    Assert.NotEqual(first, second);
  }
}
