using System.Security.Cryptography;
using System.Text.Json.Nodes;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.Engine;
using PalHatchHelper.CatalogExtractor.Configuration;
using PalHatchHelper.CatalogExtractor.Core;
using PalHatchHelper.CatalogExtractor.Doctor;
using PalHatchHelper.CatalogExtractor.Sources;

namespace PalHatchHelper.CatalogExtractor.Discovery;

public static class AssetInventoryRunner
{
  private static readonly string[] CandidateTerms =
  [
      "Pal", "Tribe", "Monster", "Waza", "Skill", "Learn", "Level", "Partner", "Element", "Passive", "Breed",
    ];

  public static JsonObject Run(ExtractionConfig config)
  {
    _ = DoctorRunner.Run(config);
    Directory.CreateDirectory(config.OutputPath);
    try
    {
      using var provider = ProviderFactory.OpenReadOnly(config);
      var sourceManifest = SourcePackageManifestBuilder.Build(config);
      DeterministicJson.WriteFile(Path.Combine(config.OutputPath, "source-package-manifest.json"), sourceManifest);
      var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
      ExtractionEvidenceGuard.WriteCurrent(config, SteamAppManifestReader.Read(config.ClientAppmanifestPath), packageHash);

      var assets = new JsonArray();
      var dataTables = new JsonArray();
      var blueprintObjects = new JsonArray();
      var localizations = new JsonArray();
      var unresolved = new JsonArray();
      foreach (var pair in provider.Files.OrderBy(value => value.Key, StringComparer.Ordinal))
      {
        var score = Score(pair.Key);
        assets.Add(new JsonObject
        {
          ["candidate_score"] = score,
          ["package_name"] = pair.Value.NameWithoutExtension,
          ["virtual_asset_path"] = pair.Key,
        });
        if (score > 0)
        {
          unresolved.Add(new JsonObject
          {
            ["candidate_score"] = score,
            ["package_name"] = pair.Value.NameWithoutExtension,
            ["reason_code"] = "SOURCE_MAPPING_UNCONFIRMED",
            ["virtual_asset_path"] = pair.Key,
          });
        }

        if (pair.Value.Extension.Equals("locres", StringComparison.OrdinalIgnoreCase))
        {
          localizations.Add(new JsonObject
          {
            ["byte_count"] = pair.Value.Size,
            ["sha256"] = HashVirtualFile(pair.Value),
            ["virtual_asset_path"] = pair.Key,
          });
        }

        if (!pair.Value.IsUePackage)
        {
          continue;
        }

        try
        {
          var package = provider.LoadPackage(pair.Value);
          foreach (var export in package.GetExports())
          {
            if (export is UDataTable table)
            {
              dataTables.Add(DataTableInventory(pair.Key, table, config.InventorySampleLimit, score));
            }

            if (IsBlueprintDiscoveryObject(export.Name, export.ExportType))
            {
              blueprintObjects.Add(BlueprintInventory(pair.Key, export, score));
            }
          }
        }
        catch (Exception)
        {
          unresolved.Add(new JsonObject
          {
            ["candidate_score"] = score,
            ["reason_code"] = "PACKAGE_STRUCTURE_UNREADABLE",
            ["virtual_asset_path"] = pair.Key,
          });
        }
      }

      WriteInventories(config.OutputPath, assets, dataTables, blueprintObjects, localizations, unresolved, provider.VirtualPaths);
      return new JsonObject
      {
        ["asset_count"] = assets.Count,
        ["blueprint_object_count"] = blueprintObjects.Count,
        ["data_table_count"] = dataTables.Count,
        ["localization_resource_count"] = localizations.Count,
        ["package_hash"] = packageHash,
        ["status"] = "inventory_complete",
        ["unresolved_source_candidate_count"] = unresolved.Count,
      };
    }
    catch (ExtractorException)
    {
      throw;
    }
    catch (Exception)
    {
      throw new ExtractorException(ErrorCodes.AssetInventoryFailed, "CUE4Parse could not inventory the mounted assets.");
    }
  }

  private static JsonObject DataTableInventory(string path, UDataTable table, int sampleLimit, int score)
  {
    var fields = table.RowMap.Values
        .SelectMany(row => row.Properties)
        .GroupBy(property => (Name: property.Name.Text, Type: PropertyType(property)))
        .OrderBy(group => group.Key.Name, StringComparer.Ordinal)
        .ThenBy(group => group.Key.Type, StringComparer.Ordinal)
        .Select(group => (JsonNode)new JsonObject
        {
          ["property_name"] = group.Key.Name,
          ["property_type"] = group.Key.Type,
        }).ToArray();
    return new JsonObject
    {
      ["candidate_score"] = score,
      ["data_table_name"] = table.Name,
      ["fields"] = new JsonArray(fields),
      ["row_count"] = table.RowMap.Count,
      ["row_names_sample"] = new JsonArray(table.RowMap.Keys.Select(key => key.Text).Order(StringComparer.Ordinal).Take(sampleLimit).Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
      ["row_struct_type"] = table.RowStructName,
      ["virtual_asset_path"] = path,
    };
  }

  private static JsonObject BlueprintInventory(string path, UObject export, int score)
  {
    var properties = export.Properties.OrderBy(value => value.Name.Text, StringComparer.Ordinal)
        .Select(property =>
        {
          var descriptor = InventoryPropertyShape.Describe(property, SafeReference(property));
          descriptor["property_name"] = property.Name.Text;
          return (JsonNode)descriptor;
        }).ToArray();
    return new JsonObject
    {
      ["candidate_score"] = score,
      ["export_name"] = export.Name,
      ["export_type"] = export.ExportType,
      ["object_kind"] = export.Name.StartsWith("Default__", StringComparison.Ordinal) ? "cdo" : "component_or_blueprint_class",
      ["properties"] = new JsonArray(properties),
      ["property_count"] = export.Properties.Count,
      ["virtual_asset_path"] = path,
    };
  }

  public static bool IsBlueprintDiscoveryObject(string objectName, string exportType) =>
      objectName.StartsWith("Default__", StringComparison.Ordinal)
      || exportType.Contains("Blueprint", StringComparison.OrdinalIgnoreCase)
      || exportType.Contains("Component", StringComparison.OrdinalIgnoreCase);

  private static string PropertyType(CUE4Parse.UE4.Assets.Objects.FPropertyTag property) =>
      InventoryPropertyShape.Describe(property, null)["property_type"]!.GetValue<string>();

  private static string? SafeReference(CUE4Parse.UE4.Assets.Objects.FPropertyTag property)
  {
    if (property.PropertyType.Text is not ("SoftObjectProperty" or "SoftClassProperty" or "ObjectProperty" or "ClassProperty" or "NameProperty" or "EnumProperty"))
    {
      return null;
    }

    var value = property.Tag?.GetValue(typeof(object));
    var text = value?.ToString();
    return string.IsNullOrWhiteSpace(text) || text.Length > 500 ? null : text;
  }

  private static int Score(string path) => CandidateTerms.Count(term => path.Contains(term, StringComparison.OrdinalIgnoreCase));

  private static string HashVirtualFile(CUE4Parse.FileProvider.Objects.GameFile file) =>
      Convert.ToHexStringLower(SHA256.HashData(file.Read()));

  internal static void WriteInventories(
      string output,
      JsonArray assets,
      JsonArray tables,
      JsonArray blueprints,
      JsonArray localizations,
      JsonArray unresolved,
      IDictionary<string, string> virtualPaths)
  {
    var documents = new Dictionary<string, JsonNode>(StringComparer.Ordinal)
    {
      ["asset-inventory.json"] = new JsonObject
      {
        ["assets"] = assets,
        ["mounted_virtual_paths"] = new JsonArray(virtualPaths.Keys.Order(StringComparer.Ordinal).Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
      },
      ["data-table-inventory.json"] = new JsonObject { ["data_tables"] = tables },
      ["blueprint-property-inventory.json"] = new JsonObject { ["blueprint_objects"] = blueprints },
      ["localization-inventory.json"] = new JsonObject { ["resources"] = localizations },
      ["unresolved-source-candidates.json"] = new JsonObject { ["candidates"] = unresolved },
    };
    foreach (var document in documents)
    {
      InventorySafetyPolicy.Validate(document.Value);
      DeterministicJson.WriteFile(Path.Combine(output, document.Key), document.Value);
    }
  }
}
