using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Contracts;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Pipeline;

internal static class CatalogRecordSchema
{
  private static readonly Dictionary<CatalogCategory, HashSet<string>> Fields =
    new Dictionary<CatalogCategory, HashSet<string>>
    {
      [CatalogCategory.Pals] = Set("pal_id", "encyclopedia_no", "name_key", "element_types", "rarity", "breeding_power", "metadata"),
      [CatalogCategory.PassiveSkills] = Set("passive_skill_id", "name_key", "description_key", "rank", "is_negative", "metadata"),
      [CatalogCategory.ActiveSkills] = Set("active_skill_id", "name_key", "element_type", "power", "cooldown_seconds", "metadata"),
      [CatalogCategory.PalActiveSkills] = Set("pal_id", "active_skill_id", "learn_level", "is_exclusive", "metadata"),
      [CatalogCategory.PartnerSkills] = Set("partner_skill_id", "pal_id", "name_key", "description_key", "metadata"),
      [CatalogCategory.BreedingRecipes] = Set("parent_a_pal_id", "parent_b_pal_id", "child_pal_id", "recipe_type", "metadata"),
      [CatalogCategory.Localizations] = Set("locale", "text_key", "text"),
    };

  public static void Validate(CatalogCategory category, JsonObject record)
  {
    var expected = Fields[category];
    if (record.Count != expected.Count || record.Any(property => !expected.Contains(property.Key)))
    {
      Fail(category);
    }

    switch (category)
    {
      case CatalogCategory.Pals:
        Stable(record, "pal_id");
        NullableInteger(record, "encyclopedia_no", minimum: 1);
        TextKey(record, "name_key");
        StableArray(record, "element_types");
        Integer(record, "rarity");
        Integer(record, "breeding_power");
        Object(record, "metadata");
        break;
      case CatalogCategory.PassiveSkills:
        Stable(record, "passive_skill_id");
        TextKey(record, "name_key");
        NullableTextKey(record, "description_key");
        Integer(record, "rank");
        Boolean(record, "is_negative");
        Object(record, "metadata");
        break;
      case CatalogCategory.ActiveSkills:
        Stable(record, "active_skill_id");
        TextKey(record, "name_key");
        Stable(record, "element_type");
        NullableInteger(record, "power");
        NullableNumber(record, "cooldown_seconds");
        Object(record, "metadata");
        break;
      case CatalogCategory.PalActiveSkills:
        Stable(record, "pal_id");
        Stable(record, "active_skill_id");
        Integer(record, "learn_level");
        Boolean(record, "is_exclusive");
        Object(record, "metadata");
        break;
      case CatalogCategory.PartnerSkills:
        Stable(record, "partner_skill_id");
        Stable(record, "pal_id");
        TextKey(record, "name_key");
        NullableTextKey(record, "description_key");
        Object(record, "metadata");
        break;
      case CatalogCategory.BreedingRecipes:
        Stable(record, "parent_a_pal_id");
        Stable(record, "parent_b_pal_id");
        Stable(record, "child_pal_id");
        if (String(record, "recipe_type") is not ("normal" or "special"))
        {
          Fail(category);
        }

        Object(record, "metadata");
        break;
      case CatalogCategory.Localizations:
        var locale = String(record, "locale");
        if (locale.Length is < 2 or > 35 || !char.IsAsciiLetter(locale[0]))
        {
          Fail(category);
        }

        TextKey(record, "text_key");
        if (String(record, "text", allowEmpty: true).Length > 10_000)
        {
          Fail(category);
        }

        break;
      default:
        throw new ArgumentOutOfRangeException(nameof(category));
    }
  }

  private static HashSet<string> Set(params string[] values) => values.ToHashSet(StringComparer.Ordinal);

  private static void Stable(JsonObject record, string field)
  {
    var value = String(record, field);
    if (!StringComparer.Ordinal.Equals(StableIdV1.Normalize(value), value))
    {
      Fail(field);
    }
  }

  private static void StableArray(JsonObject record, string field)
  {
    var values = record[field] as JsonArray;
    if (values is null || values.Count == 0)
    {
      Fail(field);
    }

    var seen = new HashSet<string>(StringComparer.Ordinal);
    string? previous = null;
    foreach (var item in values)
    {
      var value = item?.GetValue<string>() ?? throw Invalid(field);
      if (!seen.Add(value) || !StringComparer.Ordinal.Equals(StableIdV1.Normalize(value), value))
      {
        Fail(field);
      }

      if (previous is not null && StringComparer.Ordinal.Compare(previous, value) >= 0)
      {
        throw new ExtractorException(
            ErrorCodes.CatalogOrderInvalid,
            $"A set-semantic catalog array is not sorted: {field}");
      }

      previous = value;
    }
  }

  private static void TextKey(JsonObject record, string field)
  {
    var value = String(record, field);
    if (value.Length > 200 || !char.IsAsciiLetterOrDigit(value[0])
        || value.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not ('.' or '_' or '-')))
    {
      Fail(field);
    }
  }

  private static void NullableTextKey(JsonObject record, string field)
  {
    if (record[field] is not null)
    {
      TextKey(record, field);
    }
  }

  private static string String(JsonObject record, string field, bool allowEmpty = false)
  {
    if (record[field] is JsonValue value
        && value.TryGetValue<string>(out var text)
        && (allowEmpty || text.Length > 0))
    {
      return text;
    }

    throw Invalid(field);
  }

  private static void Integer(JsonObject record, string field, int minimum = 0)
  {
    if (record[field] is not JsonValue value || !value.TryGetValue<int>(out var number) || number < minimum)
    {
      Fail(field);
    }
  }

  private static void NullableInteger(JsonObject record, string field, int minimum = 0)
  {
    if (record[field] is not null)
    {
      Integer(record, field, minimum);
    }
  }

  private static void NullableNumber(JsonObject record, string field)
  {
    if (record[field] is null)
    {
      return;
    }

    var value = record[field] as JsonValue ?? throw Invalid(field);

    if (value.TryGetValue<int>(out var integer) && integer >= 0)
    {
      return;
    }

    if (!value.TryGetValue<double>(out var number) || number < 0 || !double.IsFinite(number))
    {
      Fail(field);
    }
  }

  private static void Boolean(JsonObject record, string field)
  {
    if (record[field] is not JsonValue value || !value.TryGetValue<bool>(out _))
    {
      Fail(field);
    }
  }

  private static void Object(JsonObject record, string field)
  {
    if (record[field] is not JsonObject)
    {
      Fail(field);
    }
  }

  [DoesNotReturn]
  private static void Fail(object category) => throw Invalid(category.ToString() ?? "unknown");

  private static ExtractorException Invalid(string context) => new(
    ErrorCodes.CatalogSchemaInvalid,
    $"A normalized record does not satisfy the shared Catalog Schema: {context}");
}
