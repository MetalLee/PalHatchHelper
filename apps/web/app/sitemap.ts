import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { publicPageSlugs } from "@/features/public-content/page-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", ...publicPageSlugs.map((slug) => `/${slug}`)];
  return paths.flatMap((path) => {
    const languages = {
      "zh-CN": `${siteConfig.url}/zh${path}`,
      en: `${siteConfig.url}/en${path}`,
    };
    return (["zh", "en"] as const).map((locale) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.8,
      alternates: { languages },
    }));
  });
}
