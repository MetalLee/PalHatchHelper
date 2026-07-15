using System.Text.Json;
using PalHatchHelper.CatalogExtractor.Core;

namespace PalHatchHelper.CatalogExtractor.Tests;

public sealed class StableIdV1Tests
{
  [Fact]
  public void CSharpMatchesSharedGoldenVectors()
  {
    using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "palworld-stable-id-v1.json")));
    foreach (var vector in document.RootElement.GetProperty("vectors").EnumerateArray())
    {
      Assert.Equal(
          vector.GetProperty("stable_id").GetString(),
          StableIdV1.Normalize(vector.GetProperty("source").GetString()!));
    }
  }

  [Fact]
  public void InvalidAndCollidingSourceIdentifiersFailClosed()
  {
    using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "palworld-stable-id-v1.json")));
    foreach (var vector in document.RootElement.GetProperty("invalid_vectors").EnumerateArray())
    {
      var error = Assert.Throws<ExtractorException>(() => StableIdV1.Normalize(vector.GetProperty("source").GetString()!));
      Assert.Equal(ErrorCodes.GameIdInvalid, error.Code);
    }

    foreach (var vector in document.RootElement.GetProperty("collision_vectors").EnumerateArray())
    {
      var sources = vector.GetProperty("sources").EnumerateArray().Select(value => value.GetString()!).ToArray();
      var error = Assert.Throws<ExtractorException>(() => StableIdV1.BuildMap(sources));
      Assert.Equal(ErrorCodes.GameIdNormalizationCollision, error.Code);
    }
  }
}
