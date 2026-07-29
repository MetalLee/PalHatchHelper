import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    "zh-CN": `${siteConfig.url}/zh`,
    en: `${siteConfig.url}/en`,
  };

  return (["zh", "en"] as const).map((locale) => ({
    url: `${siteConfig.url}/${locale}`,
    changeFrequency: "weekly",
    priority: 1,
    alternates: { languages },
  }));
}
