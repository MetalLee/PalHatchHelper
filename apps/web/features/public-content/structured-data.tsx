import { siteConfig } from "@/config/site";
import { catalogLocaleFor, type AppLocale } from "@/i18n/routing";

import { serializeJsonLd } from "../landing/structured-data";
import { publicCanonicalUrl } from "./metadata";
import type { PublicPageSlug } from "./page-config";

export type PublicFaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export function buildPublicPageStructuredData({
  locale,
  slug,
  title,
  description,
  homeLabel,
  faqItems,
}: Readonly<{
  locale: AppLocale;
  slug: PublicPageSlug;
  title: string;
  description: string;
  homeLabel: string;
  faqItems: readonly PublicFaqItem[];
}>) {
  const url = publicCanonicalUrl(locale, slug);
  const homeUrl = publicCanonicalUrl(locale);
  const inLanguage = catalogLocaleFor(locale);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url,
      inLanguage,
      isPartOf: { "@type": "WebSite", name: siteConfig.name, url: homeUrl },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: homeLabel,
          item: homeUrl,
        },
        { "@type": "ListItem", position: 2, name: title, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ] as const;
}

export function PublicPageStructuredData({
  values,
}: Readonly<{
  values: ReturnType<typeof buildPublicPageStructuredData>;
}>) {
  return values.map((value) => (
    <script
      key={value["@type"]}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }}
    />
  ));
}
