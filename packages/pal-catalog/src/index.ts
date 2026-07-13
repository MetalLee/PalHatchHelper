export interface CatalogPal {
  readonly id: string;
  readonly displayName: string;
  readonly iconRef: string | null;
}

export interface PalCatalog {
  readonly version: string;
  readonly pals: readonly CatalogPal[];
}

export const fixtureCatalog: PalCatalog = {
  version: "phase0-fixture-v1",
  pals: [
    {
      id: "fixture-pal",
      displayName: "测试帕鲁（非真实数据）",
      iconRef: null,
    },
  ],
};
