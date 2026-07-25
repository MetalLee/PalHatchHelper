import { CircleHelp } from "lucide-react";
import Image from "next/image";

import { palElementPath } from "@/lib/pal-assets";
import { cn } from "@/lib/utils";

const elementPresentation: Readonly<
  Record<string, { asset: string; label: string }>
> = {
  neutral: { asset: "normal", label: "一般" },
  normal: { asset: "normal", label: "一般" },
  fire: { asset: "fire", label: "火" },
  water: { asset: "water", label: "水" },
  leaf: { asset: "leaf", label: "草" },
  grass: { asset: "leaf", label: "草" },
  electric: { asset: "electricity", label: "雷" },
  electricity: { asset: "electricity", label: "雷" },
  ice: { asset: "ice", label: "冰" },
  ground: { asset: "earth", label: "地" },
  earth: { asset: "earth", label: "地" },
  dark: { asset: "dark", label: "暗" },
  dragon: { asset: "dragon", label: "龙" },
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
              aria-label={`未知属性 ${elementType}`}
              title={`未知属性：${elementType}`}
              className="inline-grid size-5 place-items-center rounded-md bg-muted text-muted-foreground"
            >
              <CircleHelp aria-hidden="true" className="size-3.5" />
            </span>
          );
        }
        const label = `${presentation.label}属性`;
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
