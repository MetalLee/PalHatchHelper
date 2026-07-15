namespace PalHatchHelper.CatalogExtractor.Core;

public static class ErrorCodes
{
  public const string ConfigurationInvalid = "EXTRACTOR_CONFIGURATION_INVALID";
  public const string WindowsX64Required = "WINDOWS_X64_REQUIRED";
  public const string Dotnet10Required = "DOTNET_10_REQUIRED";
  public const string PakDirectoryInvalid = "PAK_DIRECTORY_INVALID";
  public const string PalWindowsPakMissing = "PAL_WINDOWS_PAK_MISSING";
  public const string MappingsInvalid = "MAPPINGS_USMAP_INVALID";
  public const string ClientAppmanifestInvalid = "CLIENT_APPMANIFEST_INVALID";
  public const string OutputNotIgnored = "OUTPUT_PATH_NOT_GIT_IGNORED";
  public const string OutputTracked = "OUTPUT_PATH_GIT_TRACKED";
  public const string DiskSpaceInsufficient = "EXTRACTOR_DISK_SPACE_INSUFFICIENT";
  public const string InputNotReadable = "EXTRACTOR_INPUT_NOT_READABLE";
  public const string GameIdInvalid = "GAME_ID_INVALID";
  public const string GameIdNormalizationCollision = "GAME_ID_NORMALIZATION_COLLISION";
  public const string SourceGameVersionMismatch = "SOURCE_GAME_VERSION_MISMATCH";
  public const string StaleExtractionEvidence = "STALE_EXTRACTION_EVIDENCE";
  public const string FullCatalogReaderMissing = "FULL_CATALOG_READER_MISSING";
  public const string FullCatalogCategoryEmpty = "FULL_CATALOG_CATEGORY_EMPTY";
  public const string UnresolvedGameFacts = "UNRESOLVED_GAME_FACTS";
  public const string CatalogSchemaInvalid = "CATALOG_SCHEMA_INVALID";
  public const string CatalogDuplicateId = "CATALOG_DUPLICATE_ID";
  public const string CatalogOrderInvalid = "CATALOG_ORDER_INVALID";
  public const string CatalogReferenceInvalid = "CATALOG_REFERENCE_INVALID";
  public const string CatalogLocalizationReferenceInvalid = "CATALOG_LOCALIZATION_REFERENCE_INVALID";
  public const string CatalogSourceEvidenceInvalid = "CATALOG_SOURCE_EVIDENCE_INVALID";
  public const string CatalogHashMismatch = "CATALOG_HASH_MISMATCH";
  public const string CatalogFileMissing = "CATALOG_FILE_MISSING";
  public const string CatalogReproducibilityMismatch = "CATALOG_REPRODUCIBILITY_MISMATCH";
  public const string CatalogOutputUnsafe = "CATALOG_OUTPUT_UNSAFE";
  public const string PackageForbiddenFile = "CATALOG_PACKAGE_FORBIDDEN_FILE";
  public const string AssetInventoryFailed = "ASSET_INVENTORY_FAILED";
  public const string WindowsAssetExtractionRequired = "WINDOWS_ASSET_EXTRACTION_REQUIRED";
}
