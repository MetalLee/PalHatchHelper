"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { palPortraitPath } from "@/lib/pal-assets";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/client";

const fallbackGradients = [
  "from-sky-100 via-white to-emerald-100",
  "from-emerald-100 via-white to-lime-100",
  "from-cyan-100 via-white to-sky-100",
  "from-lime-100 via-white to-amber-50",
] as const;

function stableGradient(value: string): string {
  const hash = Array.from(value).reduce(
    (total, character) => (total * 31 + character.codePointAt(0)!) >>> 0,
    0,
  );
  return fallbackGradients[hash % fallbackGradients.length]!;
}

export function PalPortrait({
  palId,
  name,
  catalogNumber,
  size = 64,
  className,
}: Readonly<{
  palId: string;
  name: string;
  catalogNumber?: string | number | null;
  size?: number;
  className?: string;
}>) {
  const t = useCopy("Pals");
  const [failed, setFailed] = useState(false);
  const gradient = useMemo(() => stableGradient(palId), [palId]);
  const fallbackLabel =
    catalogNumber === undefined || catalogNumber === null
      ? (Array.from(name.trim())[0] ?? "?")
      : `#${catalogNumber}`;

  if (failed) {
    return (
      <span
        role="img"
        aria-label={t("portraitFallback", { name })}
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br font-bold text-forest shadow-sm",
          gradient,
          className,
        )}
        style={{ width: size, height: size }}
      >
        <span className="text-sm">{fallbackLabel}</span>
      </span>
    );
  }

  return (
    <Image
      src={palPortraitPath(palId)}
      alt={t("portrait", { name })}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-2xl border border-white/80 bg-white/70 object-contain shadow-sm",
        className,
      )}
    />
  );
}
