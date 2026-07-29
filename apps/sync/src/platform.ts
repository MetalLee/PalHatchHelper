import type { CliLocale } from "./locale.js";

export function assertSupportedPlatform(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
  locale: CliLocale = "en",
): void {
  if (platform !== "linux" || architecture !== "x64") {
    void locale;
    throw new Error("PLATFORM_UNSUPPORTED");
  }
}
