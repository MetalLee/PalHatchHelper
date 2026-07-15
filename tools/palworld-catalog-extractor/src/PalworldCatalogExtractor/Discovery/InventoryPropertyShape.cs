using System.Reflection;
using System.Text.Json.Nodes;
using CUE4Parse.UE4.Assets.Objects;

namespace PalHatchHelper.CatalogExtractor.Discovery;

public static class InventoryPropertyShape
{
  public static JsonObject Describe(
      string propertyType,
      string? innerType = null,
      string? valueType = null,
      string? structType = null,
      string? enumType = null,
      string? referenceTarget = null)
  {
    var descriptor = new JsonObject
    {
      ["property_type"] = propertyType,
      ["relationship_kind"] = RelationshipKind(propertyType),
    };
    AddIfPresent(descriptor, "inner_type", innerType);
    AddIfPresent(descriptor, "value_type", valueType);
    AddIfPresent(descriptor, "struct_type", structType);
    AddIfPresent(descriptor, "enum_type", enumType);
    AddIfPresent(descriptor, "reference_target_path", referenceTarget);
    return descriptor;
  }

  internal static JsonObject Describe(FPropertyTag property, string? referenceTarget)
  {
    var tagData = property.TagData;
    return Describe(
        property.PropertyType.Text,
        ReadMember(tagData, "InnerType", "InnerTypeName", "InnerTypeData"),
        ReadMember(tagData, "ValueType", "ValueTypeName", "ValueTypeData"),
        ReadMember(tagData, "StructName", "StructType"),
        ReadMember(tagData, "EnumName", "EnumType"),
        referenceTarget);
  }

  private static string RelationshipKind(string propertyType) => propertyType switch
  {
    "SoftObjectProperty" => "soft_object",
    "SoftClassProperty" => "soft_class",
    "ObjectProperty" => "object",
    "ClassProperty" => "class",
    "NameProperty" => "name",
    "TextProperty" => "text",
    "EnumProperty" or "ByteProperty" => "enum",
    "ArrayProperty" or "SetProperty" => "array",
    "MapProperty" => "map",
    "StructProperty" => "struct",
    _ => "scalar",
  };

  private static string? ReadMember(object? source, params string[] names)
  {
    if (source is null)
    {
      return null;
    }

    var type = source.GetType();
    foreach (var name in names)
    {
      var value = type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public)?.GetValue(source)
          ?? type.GetField(name, BindingFlags.Instance | BindingFlags.Public)?.GetValue(source);
      var text = SafeText(value);
      if (text is not null)
      {
        return text;
      }
    }

    return null;
  }

  private static string? SafeText(object? value)
  {
    var text = value?.ToString();
    return string.IsNullOrWhiteSpace(text)
        || text.Length > 200
        || text.Any(char.IsControl)
        ? null
        : text;
  }

  private static void AddIfPresent(JsonObject value, string key, string? text)
  {
    if (!string.IsNullOrWhiteSpace(text))
    {
      value[key] = text;
    }
  }
}
