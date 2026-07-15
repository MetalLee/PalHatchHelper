using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Versions;
using PalHatchHelper.CatalogExtractor.Configuration;

namespace PalHatchHelper.CatalogExtractor.Discovery;

// Provider initialization adapted from tylercamp/palcalc commit
// b822c7fda4f019bd7c57f45437f14a74061a29bc (MIT); network bootstrap removed.
public static class ProviderFactory
{
  public static DefaultFileProvider OpenReadOnly(ExtractionConfig config)
  {
    var provider = new DefaultFileProvider(
        config.PaksPath,
        SearchOption.TopDirectoryOnly,
        new VersionContainer(EGame.GAME_UE5_1),
        StringComparer.OrdinalIgnoreCase)
    {
      MappingsContainer = new FileUsmapTypeMappingsProvider(config.MappingsPath, StringComparer.Ordinal),
      ReadScriptData = false,
      SkipReferencedTextures = true,
    };
    provider.Initialize();
    provider.Mount();
    provider.LoadVirtualPaths();
    return provider;
  }
}
