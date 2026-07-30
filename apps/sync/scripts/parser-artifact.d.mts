export type ParserArtifactPlatform = "linux-x64" | "win32-x64";

export interface StageParserBinaryOptions {
  source: string;
  destination: string;
  platform: ParserArtifactPlatform;
  sha256: string;
  version: string;
}

export function stageParserBinary(
  options: StageParserBinaryOptions,
): Promise<void>;
