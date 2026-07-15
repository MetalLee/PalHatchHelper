using System.Text;
using System.Text.RegularExpressions;

namespace PalHatchHelper.CatalogExtractor.Core;

public static partial class StableIdV1
{
  private const int MaximumLength = 120;

  public static string Normalize(string source)
  {
    ArgumentNullException.ThrowIfNull(source);
    var normalized = source.Normalize(NormalizationForm.FormKC).ToLowerInvariant();
    if (normalized.Length is 0 or > MaximumLength || !StableIdPattern().IsMatch(normalized))
    {
      throw new ExtractorException(ErrorCodes.GameIdInvalid, "A source identifier does not satisfy Palworld stable ID v1.");
    }

    return normalized;
  }

  public static IReadOnlyDictionary<string, string> BuildMap(IEnumerable<string> sources)
  {
    var result = new Dictionary<string, string>(StringComparer.Ordinal);
    var sourceByStableId = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var source in sources)
    {
      var stableId = Normalize(source);
      if (sourceByStableId.TryGetValue(stableId, out var previous) && !StringComparer.Ordinal.Equals(previous, source))
      {
        throw new ExtractorException(
            ErrorCodes.GameIdNormalizationCollision,
            "Distinct source identifiers normalize to the same stable ID.");
      }

      sourceByStableId[stableId] = source;
      result[source] = stableId;
    }

    return result;
  }

  [GeneratedRegex("^[a-z0-9][a-z0-9._-]*$", RegexOptions.CultureInvariant)]
  private static partial Regex StableIdPattern();
}
