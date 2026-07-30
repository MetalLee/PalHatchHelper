using System.Globalization;
using System.Text.RegularExpressions;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Readers;

internal sealed record PassiveEffectFact(
    int Slot,
    string TargetType,
    string EffectType,
    float Value,
    string? TargetElementType);

internal static class PassiveDescriptionFormatter
{
  private static readonly Dictionary<string, string> DefaultEffectTextKeys =
      new Dictionary<string, string>(StringComparer.Ordinal)
      {
        ["CraftSpeed"] = "COMMON_STATUS_SPEED",
        ["ShotAttack"] = "COMMON_STATUS_RANGE_ATTACK",
        ["Defense"] = "COMMON_STATUS_DEFENCE",
        ["MoveSpeed"] = "MONITORING_EFFECT_MOVESPEED",
      };

  internal static string FormatTemplate(
      string template,
      IReadOnlyList<PassiveEffectFact> effects,
      IReadOnlyDictionary<string, string> commonTexts)
  {
    var result = template;
    foreach (var effect in effects.OrderBy(value => value.Slot))
    {
      result = result.Replace(
          $"{{EffectValue{effect.Slot}}}",
          FormatValue(effect.Value),
          StringComparison.Ordinal);
    }

    result = Regex.Replace(
        result,
        @"<uiCommon\s+id=\|([^|]+)\|(?:\s+style=\|[^|]+\|)?\s*/>",
        match => CommonText(commonTexts, match.Groups[1].Value),
        RegexOptions.CultureInvariant,
        TimeSpan.FromSeconds(1));
    result = Regex.Replace(
        result,
        @"</>|<Num(?:Blue|Red)(?:_[0-9]+)?>",
        string.Empty,
        RegexOptions.CultureInvariant,
        TimeSpan.FromSeconds(1));
    result = NormalizeLines(result);
    if (result.Contains('{', StringComparison.Ordinal)
        || result.Contains('}', StringComparison.Ordinal)
        || result.Contains('<', StringComparison.Ordinal)
        || result.Contains('>', StringComparison.Ordinal))
    {
      throw Unresolved("A passive description contains an unresolved template token or markup tag.");
    }

    return result;
  }

  internal static string BuildDefault(
      IReadOnlyList<PassiveEffectFact> effects,
      IReadOnlyDictionary<string, string> commonTexts)
  {
    var lines = new List<string>();
    foreach (var effect in effects.OrderBy(value => value.Slot))
    {
      if (StringComparer.OrdinalIgnoreCase.Equals(effect.EffectType, "no"))
      {
        continue;
      }

      if (!DefaultEffectTextKeys.TryGetValue(effect.EffectType, out var commonTextKey))
      {
        throw Unresolved($"A passive effect type has no reviewed display mapping: {effect.EffectType}");
      }

      var value = effect.Value > 0
          ? $"+{FormatValue(effect.Value)}"
          : FormatValue(effect.Value);
      lines.Add($"{CommonText(commonTexts, commonTextKey)} {value}%");
    }

    if (lines.Count == 0)
    {
      throw Unresolved("A displayable passive has no describable effects.");
    }

    return string.Join('\n', lines);
  }

  private static string CommonText(IReadOnlyDictionary<string, string> commonTexts, string key) =>
      commonTexts.TryGetValue(key, out var text) && !string.IsNullOrWhiteSpace(text)
          ? text
          : throw Unresolved($"A passive description references missing common text: {key}");

  private static string FormatValue(float value)
  {
    var normalized = Math.Abs(value) < 0.00005f ? 0f : value;
    return normalized.ToString("0.####", CultureInfo.InvariantCulture);
  }

  private static string NormalizeLines(string text) =>
      text.Replace("\r\n", "\n", StringComparison.Ordinal)
          .Replace('\r', '\n')
          .Trim();

  private static ExtractorException Unresolved(string message) =>
      new(ErrorCodes.UnresolvedGameFacts, message);
}
