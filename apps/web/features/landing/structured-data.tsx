import { siteConfig } from "@/config/site";
import { catalogLocaleFor, type AppLocale } from "@/i18n/routing";

export type LandingFaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildLandingStructuredData({
  locale,
  alternateName,
  softwareDescription,
  softwareRequirements,
  faqItems,
}: Readonly<{
  locale: AppLocale;
  alternateName: string;
  softwareDescription: string;
  softwareRequirements: string;
  faqItems: readonly LandingFaqItem[];
}>) {
  const url = `${siteConfig.url}/${locale}`;
  const inLanguage = catalogLocaleFor(locale);
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      alternateName,
      url,
      inLanguage,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "UtilitiesApplication",
      operatingSystem:
        "Web application: any modern browser; save sync CLI: Linux x64 and Windows x64",
      description: softwareDescription,
      url,
      inLanguage,
      softwareRequirements,
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

export function LandingStructuredData({
  values,
}: Readonly<{
  values: ReturnType<typeof buildLandingStructuredData>;
}>) {
  return values.map((value) => (
    <script
      key={value["@type"]}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(value) }}
    />
  ));
}
