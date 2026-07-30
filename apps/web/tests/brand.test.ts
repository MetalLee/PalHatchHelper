import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
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
    expect(manifest().icons?.[0]).toEqual(
      expect.objectContaining({
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      }),
    );
  });

  it("ships the optimized logo and browser app icons", () => {
    const assets = {
      "public/brand/palbeacon-logo.png":
        "2f941ffdc94d7b005c1004906497bb9f73369d78927c81041abdb990f5e1dfae",
      "app/icon.png":
        "73d85eae8a552764173d9e83035bce9ca53d031969e85571729ec1ef181b63c7",
      "app/apple-icon.png":
        "2ed97b60b49e0cb570b6469ada6573e226792e1920e613ecac92035478334bed",
      "app/favicon.ico":
        "e002360af5dd0aa796da016f6f53696167e1ce17edba58769a43d452fa200297",
    } as const;

    for (const [path, expectedHash] of Object.entries(assets)) {
      expect(statSync(resolve(process.cwd(), path)).size).toBeGreaterThan(0);
      expect(
        createHash("sha256")
          .update(readFileSync(resolve(process.cwd(), path)))
          .digest("hex"),
      ).toBe(expectedHash);
    }

    for (const [path, expectedSize] of [
      ["public/brand/palbeacon-logo.png", 1024],
      ["app/icon.png", 512],
      ["app/apple-icon.png", 180],
    ] as const) {
      const png = readFileSync(resolve(process.cwd(), path));
      expect(png.readUInt32BE(16)).toBe(expectedSize);
      expect(png.readUInt32BE(20)).toBe(expectedSize);
      expect(png[25]).toBe(6);
    }
  });

  it("lets Next.js fingerprint file-based browser icons", () => {
    const localeLayout = readFileSync(
      resolve(process.cwd(), "app/[locale]/layout.tsx"),
      "utf8",
    );

    expect(localeLayout).not.toContain('url: "/favicon.ico"');
    expect(localeLayout).not.toContain('url: "/icon.png"');
    expect(localeLayout).not.toContain('url: "/apple-icon.png"');
  });
});
