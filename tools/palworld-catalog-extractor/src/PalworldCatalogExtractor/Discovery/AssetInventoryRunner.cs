using System.Security.Cryptography;
using System.Text;
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
    var stagingDirectory = Path.Combine(
        Path.GetDirectoryName(config.OutputPath)!,
        $".{Path.GetFileName(config.OutputPath)}.inventory.{Guid.NewGuid():N}.tmp");
    Directory.CreateDirectory(stagingDirectory);
    try
    {
      var sourceManifest = SourcePackageManifestBuilder.Build(config);
      DeterministicJson.WriteFile(Path.Combine(config.OutputPath, "source-package-manifest.json"), sourceManifest);
      var packageHash = SourcePackageManifestBuilder.ComputePackageHash(sourceManifest);
      ExtractionEvidenceGuard.WriteCurrent(config, SteamAppManifestReader.Read(config.ClientAppmanifestPath), packageHash);

      InventoryResult inventory;
      var blueprintPath = Path.Combine(stagingDirectory, "blueprint-property-inventory.json");
      using (var stream = new FileStream(
                 blueprintPath,
                 FileMode.CreateNew,
                 FileAccess.Write,
                 FileShare.None,
                 4096,
                 FileOptions.WriteThrough))
      {
        using (var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, leaveOpen: true))
        {
          writer.Write("{\"blueprint_objects\":[");
          var first = true;
          inventory = ScanAssets(config, blueprint =>
          {
            InventorySafetyPolicy.Validate(blueprint);
            if (!first)
            {
              writer.Write(',');
            }

            writer.Write(DeterministicJson.Serialize(blueprint));
            first = false;
          });
          writer.Write("]}\n");
          writer.Flush();
        }

        stream.Flush(flushToDisk: true);
      }

      WriteNonBlueprintInventories(stagingDirectory, inventory);
      PublishInventoryFiles(stagingDirectory, config.OutputPath);
      return new JsonObject
      {
        ["asset_count"] = inventory.Assets.Count,
        ["blueprint_object_count"] = inventory.BlueprintObjectCount,
        ["data_table_count"] = inventory.DataTables.Count,
        ["localization_resource_count"] = inventory.Localizations.Count,
        ["package_hash"] = packageHash,
        ["status"] = "inventory_complete",
        ["unresolved_source_candidate_count"] = inventory.Unresolved.Count,
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
    finally
    {
      if (Directory.Exists(stagingDirectory))
      {
        Directory.Delete(stagingDirectory, recursive: true);
      }
    }
  }

  private static InventoryResult ScanAssets(ExtractionConfig config, Action<JsonObject> writeBlueprint)
  {
    using var provider = ProviderFactory.OpenReadOnly(config);
    var assets = new JsonArray();
    var dataTables = new JsonArray();
    var localizations = new JsonArray();
    var unresolved = new JsonArray();
    var blueprintObjectCount = 0;
    var uePackageCount = 0;
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

      var packageTables = new List<JsonObject>();
      var packageBlueprints = new List<JsonObject>();
      try
      {
        var package = provider.LoadPackage(pair.Value);
        foreach (var export in package.GetExports())
        {
          if (export is UDataTable table)
          {
            packageTables.Add(DataTableInventory(pair.Key, table, config.InventorySampleLimit, score));
          }

          if (IsBlueprintDiscoveryObject(export.Name, export.ExportType))
          {
            packageBlueprints.Add(BlueprintInventory(pair.Key, export, score));
          }
        }
      }
      catch (Exception error) when (error is not OutOfMemoryException)
      {
        unresolved.Add(new JsonObject
        {
          ["candidate_score"] = score,
          ["reason_code"] = "PACKAGE_STRUCTURE_UNREADABLE",
          ["virtual_asset_path"] = pair.Key,
        });
        continue;
      }

      foreach (var table in packageTables)
      {
        dataTables.Add(table);
      }

      foreach (var blueprint in packageBlueprints)
      {
        writeBlueprint(blueprint);
        blueprintObjectCount++;
      }

      uePackageCount++;
      if (uePackageCount % 1000 == 0)
      {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, blocking: true, compacting: false);
      }
    }

    return new InventoryResult(
        assets,
        dataTables,
        blueprintObjectCount,
        localizations,
        unresolved,
        provider.VirtualPaths.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));
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

  private static void WriteNonBlueprintInventories(string output, InventoryResult inventory)
  {
    var documents = new Dictionary<string, JsonNode>(StringComparer.Ordinal)
    {
      ["asset-inventory.json"] = new JsonObject
      {
        ["assets"] = inventory.Assets,
        ["mounted_virtual_paths"] = new JsonArray(inventory.VirtualPaths.Keys.Order(StringComparer.Ordinal).Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
      },
      ["data-table-inventory.json"] = new JsonObject { ["data_tables"] = inventory.DataTables },
      ["localization-inventory.json"] = new JsonObject { ["resources"] = inventory.Localizations },
      ["unresolved-source-candidates.json"] = new JsonObject { ["candidates"] = inventory.Unresolved },
    };
    ValidateAndWriteDocuments(output, documents);
  }

  private static void PublishInventoryFiles(string stagingDirectory, string output)
  {
    foreach (var fileName in InventorySafetyPolicy.AllowedOutputFiles
                 .Where(file => file is not "source-package-manifest.json" and not ExtractionEvidenceGuard.EvidenceManifestFileName)
                 .Order(StringComparer.Ordinal))
    {
      File.Move(Path.Combine(stagingDirectory, fileName), Path.Combine(output, fileName), overwrite: true);
    }
  }

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
    ValidateAndWriteDocuments(output, documents);
  }

  private static void ValidateAndWriteDocuments(string output, IReadOnlyDictionary<string, JsonNode> documents)
  {
    foreach (var document in documents)
    {
      InventorySafetyPolicy.Validate(document.Value);
    }

    foreach (var document in documents)
    {
      DeterministicJson.WriteFile(Path.Combine(output, document.Key), document.Value);
    }
  }

  private sealed record InventoryResult(
      JsonArray Assets,
      JsonArray DataTables,
      int BlueprintObjectCount,
      JsonArray Localizations,
      JsonArray Unresolved,
      IDictionary<string, string> VirtualPaths);
}
