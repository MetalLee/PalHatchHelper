import { statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { metadata } from "../app/layout";
import manifest from "../app/manifest";
import { brand, brandTitle } from "../config/brand";

describe("PalBeacon brand configuration", () => {
  it("keeps shared product copy in one typed source", () => {
    expect(brand).toEqual(
      expect.objectContaining({
        name: "PalBeacon",
        productName: "帕鲁服务器控制台",
        englishProductName: "Palworld Server Console",
        tagline: "时刻掌握你的帕鲁世界。",
        englishTagline: "Keep your world visible.",
        logoPath: "/brand/palbeacon-logo.png",
      }),
    );
    expect(brandTitle).toBe("PalBeacon｜帕鲁服务器控制台");
  });

  it("publishes consistent Metadata and Web App identity", () => {
    expect(metadata.title).toEqual({
      default: brandTitle,
      template: "%s | PalBeacon",
    });
    expect(metadata.description).toBe(brand.description);
    expect(metadata.applicationName).toBe(brand.name);
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        title: brandTitle,
        description: brand.description,
        siteName: brand.name,
      }),
    );
    expect(metadata.twitter).toEqual(
      expect.objectContaining({
        title: brandTitle,
        description: brand.description,
      }),
    );

    expect(manifest()).toEqual(
      expect.objectContaining({
        name: brand.name,
        short_name: brand.name,
        description: brand.description,
      }),
    );
  });

  it("ships the optimized logo and browser app icons", () => {
    for (const path of [
      "public/brand/palbeacon-logo.png",
      "app/icon.png",
      "app/apple-icon.png",
      "app/favicon.ico",
    ]) {
      expect(statSync(resolve(process.cwd(), path)).size).toBeGreaterThan(0);
    }
  });
});
