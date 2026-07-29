import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/routing";

export const alt = "PalBeacon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "LandingMetadata" });
  const logo = await readFile(
    join(process.cwd(), "public", "brand", "palbeacon-logo.png"),
  );
  const logoSource = `data:image/png;base64,${Buffer.from(logo).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(145deg, #eefaff 0%, #f4fbf8 52%, #eff9df 100%)",
          color: "#183d3a",
          padding: "74px 82px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 620,
            height: 360,
            left: -150,
            bottom: -210,
            borderRadius: "50%",
            background: "rgba(117,185,90,.28)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 420,
            right: -170,
            bottom: -250,
            borderRadius: "50%",
            background: "rgba(40,122,84,.22)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <img
              alt=""
              src={logoSource}
              width="96"
              height="96"
              style={{
                objectFit: "contain",
              }}
            />
            <div style={{ display: "flex", fontSize: 54, fontWeight: 800 }}>
              <span style={{ color: "#287a54" }}>Pal</span>
              <span style={{ color: "#0879a5" }}>Beacon</span>
            </div>
          </div>
          <div
            style={{
              marginTop: 72,
              display: "flex",
              flexDirection: "column",
              maxWidth: 940,
            }}
          >
            <div
              style={{ fontSize: 66, fontWeight: 800, letterSpacing: "-2px" }}
            >
              {t("ogLineOne")}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 42,
                fontWeight: 650,
                color: "#287a54",
              }}
            >
              {t("ogLineTwo")}
            </div>
          </div>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              fontSize: 22,
              color: "#55706a",
            }}
          >
            {siteConfig.url.replace("https://", "")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
