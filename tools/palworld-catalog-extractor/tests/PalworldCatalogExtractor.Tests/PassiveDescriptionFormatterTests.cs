using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Readers;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class PassiveDescriptionFormatterTests
{
  private static readonly IReadOnlyDictionary<string, string> CommonTexts =
      new Dictionary<string, string>(StringComparer.Ordinal)
      {
        ["COMMON_STATUS_HP"] = "Health",
        ["COMMON_STATUS_SPEED"] = "Work Speed",
        ["COMMON_STATUS_DEFENCE"] = "Defense",
      };

  [Fact]
  public void TemplateValuesCommonTextAndPresentationTagsResolveDeterministically()
  {
    var text = PassiveDescriptionFormatter.FormatTemplate(
        "Attack +{EffectValue1}%<NumBlue_13> fast</>\r\n"
            + "<uiCommon id=|COMMON_STATUS_HP| style=|Effect_Health|/>",
        [Effect(1, "ShotAttack", 20)],
        CommonTexts);

    Assert.Equal("Attack +20% fast\nHealth", text);
  }

  [Fact]
  public void MissingTemplateValueFailsClosed()
  {
    var error = Assert.Throws<ExtractorException>(() => PassiveDescriptionFormatter.FormatTemplate(
        "Attack {EffectValue2}%",
        [Effect(1, "ShotAttack", 20)],
        CommonTexts));

    Assert.Equal(ErrorCodes.UnresolvedGameFacts, error.Code);
  }

  [Fact]
  public void UnknownMarkupFailsClosed()
  {
    var error = Assert.Throws<ExtractorException>(() => PassiveDescriptionFormatter.FormatTemplate(
        "Attack {EffectValue1}% <unreviewed/>",
        [Effect(1, "ShotAttack", 20)],
        CommonTexts));

    Assert.Equal(ErrorCodes.UnresolvedGameFacts, error.Code);
  }

  [Fact]
  public void DefaultDescriptionUsesReviewedGameCommonTextMappings()
  {
    var text = PassiveDescriptionFormatter.BuildDefault(
        [Effect(1, "CraftSpeed", 20), Effect(2, "Defense", -10)],
        CommonTexts);

    Assert.Equal("Work Speed +20%\nDefense -10%", text);
  }

  [Fact]
  public void UnknownDefaultEffectFailsClosed()
  {
    var error = Assert.Throws<ExtractorException>(() => PassiveDescriptionFormatter.BuildDefault(
        [Effect(1, "UnreviewedEffect", 5)],
        CommonTexts));

    Assert.Equal(ErrorCodes.UnresolvedGameFacts, error.Code);
  }

  private static PassiveEffectFact Effect(int slot, string type, float value) =>
      new(slot, "Pal", type, value, null);
}
