export type RuntimePlatform = "linux-x64" | "win32-x64";

export function runtimePlatform(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): RuntimePlatform {
  if (platform === "linux" && architecture === "x64") return "linux-x64";
  if (platform === "win32" && architecture === "x64") return "win32-x64";
  throw new Error("PLATFORM_UNSUPPORTED");
}
