namespace PalHatchHelper.CatalogExtractor.Core;

public sealed class ExtractorException(string code, string safeMessage) : Exception($"{code}: {safeMessage}")
{
  public string Code { get; } = code;

  public string SafeMessage { get; } = safeMessage.Length <= 300 ? safeMessage : safeMessage[..300];
}
