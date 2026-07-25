import { CircleDashed, CircleHelp, CircleOff, Mars, Venus } from "lucide-react";

import { cn } from "@/lib/utils";

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
    label: "雄性",
    iconClassName: "text-sky-500",
  },
  female: {
    icon: Venus,
    label: "雌性",
    iconClassName: "text-rose-400",
  },
  genderless: {
    icon: CircleOff,
    label: "无性别",
    iconClassName: "text-slate-500",
  },
  unknown: {
    icon: CircleHelp,
    label: "未知",
    iconClassName: "text-amber-500",
  },
  pending: {
    icon: CircleDashed,
    label: "待定",
    iconClassName: "text-slate-400",
  },
} as const;

function presentationFor(gender: DisplayGender) {
  return genderPresentation[gender ?? "pending"];
}

export function genderDisplayLabel(gender: DisplayGender): string {
  return presentationFor(gender).label;
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
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <GenderIcon gender={gender} className={iconClassName} />
      <span>{label ?? genderDisplayLabel(gender)}</span>
    </span>
  );
}
