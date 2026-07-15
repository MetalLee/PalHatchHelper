using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PalHatchHelper.CatalogExtractor.Core;

public static class DeterministicJson
{
  private static readonly JsonWriterOptions WriterOptions = new()
  {
    Indented = false,
    SkipValidation = false,
  };

  public static string Serialize(JsonNode node)
  {
    using var stream = new MemoryStream();
    using (var writer = new Utf8JsonWriter(stream, WriterOptions))
    {
      WriteNode(writer, node);
    }

    return Encoding.UTF8.GetString(stream.ToArray());
  }

  public static void WriteFile(string path, JsonNode node)
  {
    AtomicFileWriter.WriteUtf8(path, writer =>
    {
      writer.Write(Serialize(node));
      writer.Write('\n');
    });
  }

  private static void WriteNode(Utf8JsonWriter writer, JsonNode? node)
  {
    switch (node)
    {
      case null:
        writer.WriteNullValue();
        break;
      case JsonObject value:
        writer.WriteStartObject();
        foreach (var property in value.OrderBy(item => item.Key, StringComparer.Ordinal))
        {
          writer.WritePropertyName(property.Key);
          WriteNode(writer, property.Value);
        }

        writer.WriteEndObject();
        break;
      case JsonArray value:
        writer.WriteStartArray();
        foreach (var item in value)
        {
          WriteNode(writer, item);
        }

        writer.WriteEndArray();
        break;
      default:
        node.WriteTo(writer);
        break;
    }
  }
}
