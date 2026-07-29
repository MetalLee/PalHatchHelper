import type { Metadata } from "next";

export const privatePageMetadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
} satisfies Metadata;

export function siteVerificationMetadata(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Metadata["verification"] | undefined {
  const google = environment.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = environment.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}
