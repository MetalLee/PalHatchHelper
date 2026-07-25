export const PAL_ASSET_CONTENT_HASH = "872e4a79af5b";

export function palPortraitPath(palId: string): string {
  const assetKey = palId.trim().toLowerCase();
  return `/pal-assets/${PAL_ASSET_CONTENT_HASH}/pals/${encodeURIComponent(assetKey)}.webp`;
}

export function palElementPath(assetName: string): string {
  const assetKey = assetName.trim().toLowerCase();
  return `/pal-assets/${PAL_ASSET_CONTENT_HASH}/elements/${encodeURIComponent(assetKey)}.webp`;
}
