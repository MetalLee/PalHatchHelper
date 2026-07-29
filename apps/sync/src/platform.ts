export function assertSupportedPlatform(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): void {
  if (platform !== "linux" || architecture !== "x64") {
    throw new Error(
      `当前版本暂不支持 ${platform}-${architecture}；palbeacon-sync 第一版仅支持 Linux x64。`,
    );
  }
}
