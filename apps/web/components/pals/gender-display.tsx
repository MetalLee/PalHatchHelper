import { CircleDashed, CircleHelp, CircleOff, Mars, Venus } from "lucide-react";

import { cn } from "@/lib/utils";
import { getCopy, useAppLocale } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";

export type DisplayGender =
  | "male"
  | "female"
  | "genderless"
  | "unknown"
  | null
  | undefined;

const genderPresentation = {
  male: {
    icon: Mars,
    labelKey: "male",
    iconClassName: "text-sky-500",
  },
  female: {
    icon: Venus,
    labelKey: "female",
    iconClassName: "text-rose-400",
  },
  genderless: {
    icon: CircleOff,
    labelKey: "genderless",
    iconClassName: "text-slate-500",
  },
  unknown: {
    icon: CircleHelp,
    labelKey: "unknown",
    iconClassName: "text-amber-500",
  },
  pending: {
    icon: CircleDashed,
    labelKey: "pending",
    iconClassName: "text-slate-400",
  },
} as const;

function presentationFor(gender: DisplayGender) {
  return genderPresentation[gender ?? "pending"];
}

export function genderDisplayLabel(
  gender: DisplayGender,
  locale: AppLocale = "zh",
): string {
  return getCopy(locale, "Pals")(presentationFor(gender).labelKey);
}

export function GenderIcon({
  gender,
  className,
}: Readonly<{ gender: DisplayGender; className?: string }>) {
  const presentation = presentationFor(gender);
  const Icon = presentation.icon;

  return (
    <Icon
      aria-hidden="true"
      data-gender-icon={gender ?? "pending"}
      className={cn("size-4 shrink-0", presentation.iconClassName, className)}
    />
  );
}

export function GenderMarker({
  gender,
  className,
  iconClassName,
}: Readonly<{
  gender: DisplayGender;
  className?: string;
  iconClassName?: string;
}>) {
  const label = genderDisplayLabel(gender, useAppLocale());
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      <GenderIcon gender={gender} className={iconClassName} />
    </span>
  );
}

export function GenderDisplay({
  gender,
  label,
  className,
  iconClassName,
}: Readonly<{
  gender: DisplayGender;
  label?: string;
  className?: string;
  iconClassName?: string;
}>) {
  const locale = useAppLocale();
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <GenderIcon gender={gender} className={iconClassName} />
      <span>{label ?? genderDisplayLabel(gender, locale)}</span>
    </span>
  );
}
