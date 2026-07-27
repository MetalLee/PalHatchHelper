import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function BrandWordmark({ className }: Readonly<{ className?: string }>) {
  return (
    <span aria-label={brand.name} className={cn("inline-flex", className)}>
      <span aria-hidden="true" className="text-primary" data-brand-part="pal">
        Pal
      </span>
      <span
        aria-hidden="true"
        className="text-sky-700"
        data-brand-part="beacon"
      >
        Beacon
      </span>
    </span>
  );
}
