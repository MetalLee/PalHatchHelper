using System.Globalization;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Contracts;

internal static class SharedCatalogSchemaValidator
{
  private const string SchemaResourceName = "PalHatchHelper.GameCatalogSchema.json";
  private static readonly Lazy<JsonObject> Schema = new(LoadSchema);

  public static void ValidateManifest(JsonObject manifest) => ValidateNode(manifest, Schema.Value, "manifest");

  public static void ValidateDefinition(JsonObject record, string definition)
  {
    var definitions = Schema.Value["$defs"]?.AsObject()
        ?? throw Invalid("schema definitions");
    var recordSchema = definitions[definition]?.AsObject()
        ?? throw Invalid($"schema definition {definition}");
    ValidateNode(record, recordSchema, definition);
  }

  private static JsonObject LoadSchema()
  {
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(SchemaResourceName)
        ?? throw Invalid("embedded shared schema");
    return JsonNode.Parse(stream)?.AsObject() ?? throw Invalid("embedded shared schema");
  }

  private static void ValidateNode(JsonNode? value, JsonObject schema, string context)
  {
    if (schema["$ref"] is JsonValue referenceValue
        && referenceValue.TryGetValue<string>(out var reference))
    {
      ValidateNode(value, Resolve(reference), context);
      return;
    }

    if (schema["anyOf"] is JsonArray alternatives
        && !alternatives.Any(alternative => alternative is JsonObject candidate && Matches(value, candidate, context)))
    {
      throw Invalid(context);
    }

    if (schema["allOf"] is JsonArray combined)
    {
      foreach (var item in combined.OfType<JsonObject>())
      {
        ValidateNode(value, item, context);
      }
    }

    if (schema["if"] is JsonObject condition)
    {
      var branch = Matches(value, condition, context) ? schema["then"] : schema["else"];
      if (branch is JsonObject branchSchema)
      {
        ValidateNode(value, branchSchema, context);
      }
    }

    ValidateConstAndEnum(value, schema, context);
    ValidateType(value, schema, context);
    switch (value)
    {
      case JsonObject objectValue:
        ValidateObject(objectValue, schema, context);
        break;
      case JsonArray arrayValue:
        ValidateArray(arrayValue, schema, context);
        break;
      case JsonValue scalarValue:
        ValidateScalar(scalarValue, schema, context);
        break;
    }
  }

  private static JsonObject Resolve(string reference)
  {
    const string prefix = "#/$defs/";
    if (!reference.StartsWith(prefix, StringComparison.Ordinal))
    {
      throw Invalid("unsupported schema reference");
    }

    var name = reference[prefix.Length..];
    return Schema.Value["$defs"]?[name]?.AsObject()
        ?? throw Invalid($"schema reference {name}");
  }

  private static bool Matches(JsonNode? value, JsonObject schema, string context)
  {
    try
    {
      ValidateNode(value, schema, context);
      return true;
    }
    catch (ExtractorException error) when (error.Code == ErrorCodes.CatalogSchemaInvalid)
    {
      return false;
    }
  }

  private static void ValidateConstAndEnum(JsonNode? value, JsonObject schema, string context)
  {
    if (schema.TryGetPropertyValue("const", out var constant) && !JsonNode.DeepEquals(value, constant))
    {
      throw Invalid(context);
    }

    if (schema["enum"] is JsonArray values && !values.Any(candidate => JsonNode.DeepEquals(value, candidate)))
    {
      throw Invalid(context);
    }
  }

  private static void ValidateType(JsonNode? value, JsonObject schema, string context)
  {
    if (schema["type"] is not JsonNode typeNode)
    {
      return;
    }

    var allowed = typeNode switch
    {
      JsonArray values => values.Select(item => item?.GetValue<string>() ?? string.Empty),
      JsonValue scalar when scalar.TryGetValue<string>(out var type) => [type],
      _ => [],
    };
    if (!allowed.Any(type => IsType(value, type)))
    {
      throw Invalid(context);
    }
  }

  private static bool IsType(JsonNode? value, string type) => type switch
  {
    "null" => value is null,
    "object" => value is JsonObject,
    "array" => value is JsonArray,
    "string" => TryString(value, out _),
    "integer" => TryInteger(value, out _),
    "number" => TryNumber(value, out _),
    "boolean" => value is JsonValue scalar && scalar.TryGetValue<bool>(out _),
    _ => false,
  };

  private static void ValidateObject(JsonObject value, JsonObject schema, string context)
  {
    var properties = schema["properties"] as JsonObject;
    if (schema["required"] is JsonArray required)
    {
      foreach (var property in required.Select(item => item?.GetValue<string>() ?? string.Empty))
      {
        if (!value.ContainsKey(property))
        {
          throw Invalid(context);
        }
      }
    }

    if (schema["additionalProperties"] is JsonValue additional
        && additional.TryGetValue<bool>(out var allowed)
        && !allowed
        && properties is not null
        && value.Any(property => !properties.ContainsKey(property.Key)))
    {
      throw Invalid(context);
    }

    if (properties is null)
    {
      return;
    }

    foreach (var property in value)
    {
      if (properties[property.Key] is JsonObject propertySchema)
      {
        ValidateNode(property.Value, propertySchema, $"{context}.{property.Key}");
      }
    }
  }

  private static void ValidateArray(JsonArray value, JsonObject schema, string context)
  {
    if (schema["minItems"] is JsonValue minimumValue
        && minimumValue.TryGetValue<int>(out var minimum)
        && value.Count < minimum)
    {
      throw Invalid(context);
    }

    if (schema["uniqueItems"] is JsonValue uniqueValue
        && uniqueValue.TryGetValue<bool>(out var unique)
        && unique
        && value.Select(item => item is null ? "null" : DeterministicJson.Serialize(item))
            .Distinct(StringComparer.Ordinal)
            .Count() != value.Count)
    {
      throw Invalid(context);
    }

    if (schema["items"] is JsonObject itemSchema)
    {
      for (var index = 0; index < value.Count; index++)
      {
        ValidateNode(value[index], itemSchema, $"{context}[{index}]");
      }
    }
  }

  private static void ValidateScalar(JsonValue value, JsonObject schema, string context)
  {
    if (TryString(value, out var text))
    {
      if (schema["minLength"] is JsonValue minimumValue
          && minimumValue.TryGetValue<int>(out var minimum)
          && text.Length < minimum)
      {
        throw Invalid(context);
      }

      if (schema["maxLength"] is JsonValue maximumValue
          && maximumValue.TryGetValue<int>(out var maximum)
          && text.Length > maximum)
      {
        throw Invalid(context);
      }

      if (schema["pattern"] is JsonValue patternValue
          && patternValue.TryGetValue<string>(out var pattern)
          && !Regex.IsMatch(text, pattern, RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1)))
      {
        throw Invalid(context);
      }

      if (schema["format"] is JsonValue formatValue
          && formatValue.TryGetValue<string>(out var format)
          && !MatchesFormat(text, format))
      {
        throw Invalid(context);
      }
    }

    if (schema["minimum"] is JsonValue numberValue
        && TryNumber(numberValue, out var minimumNumber)
        && TryNumber(value, out var actualNumber)
        && actualNumber < minimumNumber)
    {
      throw Invalid(context);
    }
  }

  private static bool MatchesFormat(string value, string format) => format switch
  {
    "date-time" => DateTimeOffset.TryParse(
        value,
        CultureInfo.InvariantCulture,
        DateTimeStyles.RoundtripKind,
        out _),
    "uuid" => Guid.TryParseExact(value, "D", out _),
    _ => true,
  };

  private static bool TryString(JsonNode? value, out string result)
  {
    result = string.Empty;
    if (value is JsonValue scalar
        && scalar.TryGetValue<string>(out var text)
        && text is not null)
    {
      result = text;
      return true;
    }

    return false;
  }

  private static bool TryInteger(JsonNode? value, out long result)
  {
    result = 0;
    return value is JsonValue scalar
        && (scalar.TryGetValue(out result)
            || (scalar.TryGetValue<int>(out var integer) && (result = integer) == integer));
  }

  private static bool TryNumber(JsonNode? value, out double result)
  {
    result = 0;
    if (value is not JsonValue scalar)
    {
      return false;
    }

    if (scalar.TryGetValue(out result))
    {
      return double.IsFinite(result);
    }

    if (TryInteger(scalar, out var integer))
    {
      result = integer;
      return true;
    }

    return false;
  }

  private static ExtractorException Invalid(string context) => new(
      ErrorCodes.CatalogSchemaInvalid,
      $"Catalog data does not satisfy the embedded shared JSON Schema: {context}");
}
