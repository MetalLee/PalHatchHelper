using System.Text.Json.Nodes;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Discovery;

public static class InventorySafetyPolicy
{
  public static readonly IReadOnlySet<string> AllowedOutputFiles = new HashSet<string>(StringComparer.Ordinal)
    {
        "source-package-manifest.json",
        "extraction-evidence-manifest.json",
        "asset-inventory.json",
        "data-table-inventory.json",
        "blueprint-property-inventory.json",
        "localization-inventory.json",
        "unresolved-source-candidates.json",
    };

  private static readonly HashSet<string> ForbiddenPropertyNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "binary", "bytes", "content", "data", "payload", "raw_data", "texture", "audio", "model",
    };

  public static void Validate(JsonNode node)
  {
    switch (node)
    {
      case JsonObject value:
        foreach (var property in value)
        {
          if (ForbiddenPropertyNames.Contains(property.Key))
          {
            throw new ExtractorException(ErrorCodes.AssetInventoryFailed, "Inventory output attempted to include a binary-content field.");
          }

          if (property.Value is not null)
          {
            Validate(property.Value);
          }
        }

        break;
      case JsonArray value:
        foreach (var item in value.Where(item => item is not null))
        {
          Validate(item!);
        }

        break;
      case JsonValue value when value.TryGetValue<string>(out var text) && text.Length > 4096:
        throw new ExtractorException(ErrorCodes.AssetInventoryFailed, "Inventory output contains an over-limit structural sample.");
    }
  }
}
