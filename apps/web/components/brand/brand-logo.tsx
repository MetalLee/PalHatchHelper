import Image from "next/image";

import { brand, brandLogoAlt } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({
  size,
  className,
  priority = false,
}: Readonly<{
  size: number;
  className?: string;
  priority?: boolean;
}>) {
  return (
    <Image
      src={brand.logoPath}
      alt={brandLogoAlt}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={cn("shrink-0 object-contain", className)}
      priority={priority}
    />
  );
}
