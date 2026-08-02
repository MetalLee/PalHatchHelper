import { describe, expect, it, vi } from "vitest";

const copy = vi.hoisted(() => ({
  zh: {
    Metadata: {
      title: "PalBeacon",
      description: "中文描述",
      keywords: "甲,乙",
    },
    LandingMetadata: {
      title: "幻兽帕鲁服务器控制台｜物品库存趋势与公会配种 - PalBeacon",
      description:
        "PalBeacon 是幻兽帕鲁服务器控制台：只读同步服务器存档，查看帕鲁与物品库存、数量和基地趋势，并协作规划多代配种路线。",
      keywords: "幻兽帕鲁存档同步,帕鲁库存,帕鲁物品库存",
      ogLineOne: "追踪物品库存趋势",
      ogLineTwo: "规划真正可执行的配种路线",
    },
    PublicContent: {
      saveSyncMetadataTitle: "幻兽帕鲁服务器存档同步｜PalBeacon",
      saveSyncMetadataDescription:
        "使用 PalBeacon 只读同步工具连接幻兽帕鲁服务器存档，将脱敏后的玩家、公会与帕鲁库存同步到 Web 控制台。",
      savePlannerMetadataTitle: "基于存档的帕鲁配种规划｜PalBeacon",
      savePlannerMetadataDescription:
        "基于真实存档和公会库存分析目标被动分布，规划中间亲本并生成可执行的多代帕鲁配种路线。",
      passiveRouteMetadataTitle: "帕鲁被动继承路线｜PalBeacon",
      passiveRouteMetadataDescription:
        "了解如何利用现有帕鲁与公会库存构造中间亲本，逐代集中目标被动并形成可执行的树状配种路线。",
      guildInventoryMetadataTitle: "公会帕鲁库存协作｜PalBeacon",
      guildInventoryMetadataDescription:
        "将私人服务器成员的帕鲁库存安全同步到控制台，在受控共享范围内协作查找亲本、计算路线并执行配种计划。",
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
      title:
        "Palworld Server Console | Item Inventory Trends & Guild Breeding - PalBeacon",
      description:
        "PalBeacon is a Palworld server console for read-only save sync, item inventory trends by base, guild inventory, and practical multi-generation breeding plans.",
      keywords: "Palworld save sync,Palworld inventory,Palworld item inventory",
      ogLineOne: "Track item inventory trends",
      ogLineTwo: "Build a breeding plan you can follow",
    },
    PublicContent: {
      saveSyncMetadataTitle: "Palworld Server Save Sync | PalBeacon",
      saveSyncMetadataDescription:
        "Connect a Palworld server save to the PalBeacon console with a read-only client that uploads sanitized player, guild, and Pal inventory data.",
      savePlannerMetadataTitle: "Palworld Save Breeding Planner | PalBeacon",
      savePlannerMetadataDescription:
        "Build practical Palworld breeding routes from real save inventory, shared guild Pals, passive distribution, and usable intermediate parents.",
      passiveRouteMetadataTitle: "Palworld Passive Breeding Routes | PalBeacon",
      passiveRouteMetadataDescription:
        "Learn how to combine passives across existing and shared guild Pals, build intermediate parents, and follow a practical multi-generation route.",
      guildInventoryMetadataTitle: "Palworld Guild Inventory | PalBeacon",
      guildInventoryMetadataDescription:
        "Sync guild Pal inventories into one server console, control sharing, find usable parents, and collaborate on breeding routes and saved plans.",
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
    namespace: "Metadata" | "LandingMetadata" | "PublicContent" | "Login";
  }) => {
    const messages = copy[locale][namespace] as Record<string, string>;
    return (key: string) => messages[key];
  },
  setRequestLocale: vi.fn(),
}));

import { generateMetadata as generateLayoutMetadata } from "../app/[locale]/layout";
import { generateMetadata as generateLandingMetadata } from "../app/[locale]/page";
import { generateMetadata as generateGuildInventoryMetadata } from "../app/[locale]/guild-pal-inventory/page";
import { generateMetadata as generateLoginMetadata } from "../app/[locale]/login/page";
import { generateMetadata as generateSaveSyncMetadata } from "../app/[locale]/palworld-save-sync/page";
import { generateMetadata as generatePassiveRouteMetadata } from "../app/[locale]/passive-breeding-route/page";
import { generateMetadata as generateSavePlannerMetadata } from "../app/[locale]/save-breeding-planner/page";
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
    expect(enMessages.LandingMetadata.keywords).toContain(
      "Palworld item inventory",
    );
    expect(chineseMetadata.description).toBe(
      zhMessages.LandingMetadata.description,
    );
    expect(zhMessages.LandingMetadata.description).toBe(
      "PalBeacon 是幻兽帕鲁服务器控制台：只读同步服务器存档，查看帕鲁与物品库存、数量和基地趋势，并协作规划多代配种路线。",
    );
    expect(zhMessages.LandingMetadata.keywords).toContain("帕鲁物品库存");
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

  it.each(["zh", "en"] as const)(
    "publishes unique, complete metadata for all five %s public URLs",
    async (locale) => {
      const generators = [
        ["", generateLandingMetadata],
        ["/palworld-save-sync", generateSaveSyncMetadata],
        ["/save-breeding-planner", generateSavePlannerMetadata],
        ["/passive-breeding-route", generatePassiveRouteMetadata],
        ["/guild-pal-inventory", generateGuildInventoryMetadata],
      ] as const;
      const values = await Promise.all(
        generators.map(
          async ([path, generate]) =>
            [
              path,
              await generate({ params: Promise.resolve({ locale }) }),
            ] as const,
        ),
      );
      const titles = values.map(([, metadata]) =>
        typeof metadata.title === "object" &&
        metadata.title !== null &&
        "absolute" in metadata.title
          ? metadata.title.absolute
          : metadata.title,
      );
      const descriptions = values.map(([, metadata]) => metadata.description);

      expect(new Set(titles).size).toBe(values.length);
      expect(new Set(descriptions).size).toBe(values.length);
      for (const [path, metadata] of values) {
        const canonical = `https://www.palbeacon.app/${locale}${path}`;
        expect(metadata.title).toMatchObject({ absolute: expect.any(String) });
        expect(metadata.description).toEqual(expect.any(String));
        expect(metadata.alternates?.canonical).toBe(canonical);
        expect(metadata.alternates?.languages).toEqual({
          "zh-CN": `https://www.palbeacon.app/zh${path}`,
          en: `https://www.palbeacon.app/en${path}`,
          "x-default": `https://www.palbeacon.app/zh${path}`,
        });
        expect(metadata.openGraph).toMatchObject({
          url: canonical,
          locale: locale === "zh" ? "zh_CN" : "en_US",
        });
        expect(metadata.robots).toEqual({ index: true, follow: true });
        if (locale === "en") {
          expect(metadata.description!.length).toBeGreaterThanOrEqual(120);
          expect(metadata.description!.length).toBeLessThanOrEqual(160);
        }
      }
    },
  );

  it("lists exactly the ten public canonical URLs in the sitemap", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.palbeacon.app/zh",
      "https://www.palbeacon.app/en",
      "https://www.palbeacon.app/zh/palworld-save-sync",
      "https://www.palbeacon.app/en/palworld-save-sync",
      "https://www.palbeacon.app/zh/save-breeding-planner",
      "https://www.palbeacon.app/en/save-breeding-planner",
      "https://www.palbeacon.app/zh/passive-breeding-route",
      "https://www.palbeacon.app/en/passive-breeding-route",
      "https://www.palbeacon.app/zh/guild-pal-inventory",
      "https://www.palbeacon.app/en/guild-pal-inventory",
    ]);
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
    for (let index = 0; index < entries.length; index += 2) {
      const chinese = entries[index]!;
      const english = entries[index + 1]!;
      const expectedAlternates = {
        "zh-CN": chinese.url,
        en: english.url,
      };
      expect(chinese.alternates?.languages).toEqual(expectedAlternates);
      expect(english.alternates?.languages).toEqual(expectedAlternates);
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
