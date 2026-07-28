import { CircleHelp } from "lucide-react";
import Image from "next/image";

import { palElementPath } from "@/lib/pal-assets";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/client";

const elementPresentation: Readonly<
  Record<string, { asset: string; label: string }>
> = {
  neutral: { asset: "normal", label: "neutral" },
  normal: { asset: "normal", label: "neutral" },
  fire: { asset: "fire", label: "fire" },
  water: { asset: "water", label: "water" },
  leaf: { asset: "leaf", label: "grass" },
  grass: { asset: "leaf", label: "grass" },
  electric: { asset: "electricity", label: "electric" },
  electricity: { asset: "electricity", label: "electric" },
  ice: { asset: "ice", label: "ice" },
  ground: { asset: "earth", label: "ground" },
  earth: { asset: "earth", label: "ground" },
  dark: { asset: "dark", label: "dark" },
  dragon: { asset: "dragon", label: "dragon" },
};

export function PalElementIcons({
  elementTypes,
  size = 18,
  className,
}: Readonly<{
  elementTypes: readonly string[];
  size?: number;
  className?: string;
}>) {
  const t = useCopy("Pals");
  if (elementTypes.length === 0) return null;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {elementTypes.map((elementType) => {
        const normalizedType = elementType.trim().toLowerCase();
        const presentation = elementPresentation[normalizedType];
        if (presentation === undefined) {
          return (
            <span
              key={elementType}
              role="img"
              aria-label={t("unknownElement", { element: elementType })}
              title={t("unknownElementTitle", { element: elementType })}
              className="inline-grid size-5 place-items-center rounded-md bg-muted text-muted-foreground"
            >
              <CircleHelp aria-hidden="true" className="size-3.5" />
            </span>
          );
        }
        const label = t("element", {
          name: t(presentation.label as "neutral"),
        });
        return (
          <span
            key={elementType}
            role="img"
            aria-label={label}
            title={label}
            className="inline-flex shrink-0"
          >
            <Image
              src={palElementPath(presentation.asset)}
              alt=""
              width={size}
              height={size}
              className="rounded-[0.3rem]"
            />
          </span>
        );
      })}
    </span>
  );
}
