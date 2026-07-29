import { statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";
import { brand } from "../config/brand";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";

describe("PalBeacon brand configuration", () => {
  it("keeps locale-neutral product identity in one typed source", () => {
    expect(brand).toEqual(
      expect.objectContaining({
        name: "PalBeacon",
        englishProductName: "Palworld Server Console",
        englishTagline: "Keep your world visible.",
        logoPath: "/brand/palbeacon-logo.png",
      }),
    );
  });

  it("publishes localized metadata copy and a neutral Web App identity", () => {
    expect(zhMessages.Metadata.title).toBe("PalBeacon");
    expect(enMessages.Metadata.title).toBe("PalBeacon");
    expect(zhMessages.Metadata.description).not.toBe(
      enMessages.Metadata.description,
    );
    expect(manifest()).toEqual(
      expect.objectContaining({
        name: brand.name,
        short_name: brand.name,
        description: "PalBeacon Pal breeding workspace",
        start_url: "/zh",
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
