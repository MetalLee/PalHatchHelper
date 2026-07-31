using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;
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

  [Fact]
  public void CurrentItemRedirectDestinationUsesKeyProperty()
  {
    Assert.Equal(
        "Accessory_AquaResist_1",
        ConfirmedCatalogReaders.ItemRedirectDestinationId(
            new Dictionary<string, string>(StringComparer.Ordinal) { ["Key"] = "Accessory_AquaResist_1" }));

    var error = Assert.Throws<ExtractorException>(() =>
        ConfirmedCatalogReaders.ItemRedirectDestinationId(
            new Dictionary<string, string>(StringComparer.Ordinal) { ["StaticId"] = "legacy" }));
    Assert.Equal(ErrorCodes.UnresolvedGameFacts, error.Code);
  }

  [Theory]
  [InlineData("material", "materialore", "handcraft")]
  [InlineData("weapon", "weaponhandgun", "handcraft")]
  [InlineData("food", "fooddishmeat", "cooking")]
  public void ConfirmedItemRecipeTableMapsCraftKinds(
      string typeA,
      string typeB,
      string expected)
  {
    Assert.Equal(expected, ConfirmedCatalogReaders.ItemRecipeCraftKind(typeA, typeB));
  }

  [Fact]
  public void BreedingRecipeKeysRetainGenderQualifiedOutcomes()
  {
    static JsonObject Recipe(string parentAGender, string parentBGender) => new()
    {
      ["parent_a_pal_id"] = "fixturepala",
      ["parent_a_gender"] = parentAGender,
      ["parent_b_pal_id"] = "fixturepalb",
      ["parent_b_gender"] = parentBGender,
      ["child_pal_id"] = "fixturechild",
      ["recipe_type"] = "special",
    };

    var femaleMale = CatalogCategories.RecordKey(
        CatalogCategory.BreedingRecipes,
        Recipe("female", "male"));
    var maleFemale = CatalogCategories.RecordKey(
        CatalogCategory.BreedingRecipes,
        Recipe("male", "female"));

    Assert.Equal("fixturepala\0female\0fixturepalb\0male\0special", femaleMale);
    Assert.NotEqual(femaleMale, maleFemale);
  }
}
