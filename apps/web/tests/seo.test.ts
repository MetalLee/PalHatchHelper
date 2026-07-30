import { describe, expect, it, vi } from "vitest";

const copy = vi.hoisted(() => ({
  zh: {
    Metadata: {
      title: "PalBeacon",
      description: "中文描述",
      keywords: "甲,乙",
    },
    LandingMetadata: {
      title: "PalBeacon｜幻兽帕鲁存档同步、库存管理与配种路线规划",
      description:
        "使用只读工具同步《幻兽帕鲁》服务器存档，查看个人与公会帕鲁库存，并根据目标帕鲁和期望被动生成尽量利用现有库存的多代配种路线。",
      keywords: "幻兽帕鲁存档同步,帕鲁库存",
      ogLineOne: "同步帕鲁存档",
      ogLineTwo: "规划真正可执行的配种路线",
    },
    Login: { metadataTitle: "登录 | PalBeacon" },
  },
  en: {
    Metadata: {
      title: "PalBeacon",
      description: "English description",
      keywords: "one,two",
    },
    LandingMetadata: {
      title: "PalBeacon | Palworld Save Sync, Inventory and Breeding Planner",
      description:
        "Sync your Palworld server save with a read-only client, explore player and guild Pal inventories, and build practical multi-generation breeding plans.",
      keywords: "Palworld save sync,Palworld inventory",
      ogLineOne: "Sync your save",
      ogLineTwo: "Build a breeding plan you can follow",
    },
    Login: { metadataTitle: "Sign in | PalBeacon" },
  },
}));

vi.mock("next-intl/server", () => ({
  getMessages: vi.fn(),
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: "zh" | "en";
    namespace: "Metadata" | "LandingMetadata" | "Login";
  }) => {
    const messages = copy[locale][namespace] as Record<string, string>;
    return (key: string) => messages[key];
  },
  setRequestLocale: vi.fn(),
}));

import { generateMetadata as generateLayoutMetadata } from "../app/[locale]/layout";
import { generateMetadata as generateLandingMetadata } from "../app/[locale]/page";
import { generateMetadata as generateLoginMetadata } from "../app/[locale]/login/page";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { metadata as workspaceMetadata } from "../app/[locale]/(workspace)/layout";
import { metadata as adminMetadata } from "../app/[locale]/admin/layout";
import { privatePageMetadata, siteVerificationMetadata } from "../config/seo";
import { siteConfig } from "../config/site";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";

describe("public search metadata", () => {
  it.each([
    ["zh", "zh_CN", "https://www.palbeacon.app/zh"],
    ["en", "en_US", "https://www.palbeacon.app/en"],
  ] as const)(
    "uses a self-canonical and complete language alternates for %s",
    async (locale, ogLocale, canonical) => {
      const metadata = await generateLandingMetadata({
        params: Promise.resolve({ locale }),
      });

      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.alternates?.languages).toEqual({
        "zh-CN": "https://www.palbeacon.app/zh",
        en: "https://www.palbeacon.app/en",
        "x-default": "https://www.palbeacon.app/zh",
      });
      expect(metadata.openGraph).toMatchObject({
        url: canonical,
        locale: ogLocale,
      });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    },
  );

  it("keeps the English landing description within search snippet limits without changing other SEO metadata", async () => {
    const [englishMetadata, chineseMetadata] = await Promise.all([
      generateLandingMetadata({ params: Promise.resolve({ locale: "en" }) }),
      generateLandingMetadata({ params: Promise.resolve({ locale: "zh" }) }),
    ]);
    const description = enMessages.LandingMetadata.description;
    const canonical = "https://www.palbeacon.app/en";
    const imageUrl = `${canonical}/opengraph-image`;

    expect(copy.en.LandingMetadata.description).toBe(description);
    expect(englishMetadata.description).toBe(description);
    expect(description).not.toBe("");
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(chineseMetadata.description).toBe(
      zhMessages.LandingMetadata.description,
    );
    expect(zhMessages.LandingMetadata.description).toBe(
      "使用只读工具同步《幻兽帕鲁》服务器存档，查看个人与公会帕鲁库存，并根据目标帕鲁和期望被动生成尽量利用现有库存的多代配种路线。",
    );
    expect(englishMetadata.alternates).toEqual({
      canonical,
      languages: {
        "zh-CN": "https://www.palbeacon.app/zh",
        en: canonical,
        "x-default": "https://www.palbeacon.app/zh",
      },
    });
    expect(englishMetadata.openGraph).toEqual({
      title: copy.en.LandingMetadata.title,
      description,
      siteName: siteConfig.name,
      type: "website",
      url: canonical,
      locale: "en_US",
      alternateLocale: ["zh_CN"],
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: copy.en.LandingMetadata.title,
        },
      ],
    });
    expect(englishMetadata.twitter).toEqual({
      card: "summary_large_image",
      title: copy.en.LandingMetadata.title,
      description,
      images: [imageUrl],
    });
    expect(englishMetadata.robots).toEqual({ index: true, follow: true });
  });

  it("centralizes the canonical host and omits empty verification tags", async () => {
    const metadata = await generateLayoutMetadata({
      params: Promise.resolve({ locale: "zh" }),
    });
    expect(siteConfig.url).toBe("https://www.palbeacon.app");
    expect(metadata.metadataBase?.toString()).toBe(
      "https://www.palbeacon.app/",
    );
    expect(siteVerificationMetadata({})).toBeUndefined();
    expect(
      siteVerificationMetadata({
        GOOGLE_SITE_VERIFICATION: " google-token ",
        BING_SITE_VERIFICATION: " bing-token ",
      }),
    ).toEqual({
      google: "google-token",
      other: { "msvalidate.01": "bing-token" },
    });
  });

  it("lists only the two public canonical URLs in the sitemap", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.palbeacon.app/zh",
      "https://www.palbeacon.app/en",
    ]);
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        "zh-CN": "https://www.palbeacon.app/zh",
        en: "https://www.palbeacon.app/en",
      });
    }
    expect(JSON.stringify(entries)).not.toMatch(
      /overview|login|pals|breeder|plans|admin|data-status/,
    );
  });

  it("allows public pages, avoids API crawling and references the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://www.palbeacon.app/sitemap.xml",
      host: "https://www.palbeacon.app",
    });
  });
});

describe("private route indexing controls", () => {
  it("marks workspace and admin route trees noindex", () => {
    expect(workspaceMetadata).toEqual(privatePageMetadata);
    expect(adminMetadata).toEqual(privatePageMetadata);
    expect(privatePageMetadata.robots).toEqual({
      index: false,
      follow: false,
      nocache: true,
    });
  });

  it.each([
    ["zh", "登录 | PalBeacon"],
    ["en", "Sign in | PalBeacon"],
  ] as const)(
    "localizes and noindexes the %s login page",
    async (locale, title) => {
      const metadata = await generateLoginMetadata({
        params: Promise.resolve({ locale }),
      });
      expect(metadata.title).toEqual({ absolute: title });
      expect(metadata.robots).toEqual(privatePageMetadata.robots);
    },
  );
});
