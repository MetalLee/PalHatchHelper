export function palPortraitPath(palId: string): string {
  const assetKey = palId.trim().toLowerCase();
  return `/pal-assets/pals/${encodeURIComponent(assetKey)}.webp`;
}

export function palElementPath(assetName: string): string {
  const assetKey = assetName.trim().toLowerCase();
  return `/pal-assets/elements/${encodeURIComponent(assetKey)}.webp`;
}

export function itemIconPath(itemId: string): string {
  const assetKey = itemId.trim().toLowerCase();
  return `/pal-assets/items/${encodeURIComponent(assetKey)}.webp`;
}
