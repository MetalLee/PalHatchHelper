"use client";

import { PageError } from "@/components/states/page-error";
import { useCopy } from "@/i18n/client";

export function PlanError({ code }: Readonly<{ code: string }>) {
  const t = useCopy("Plans");
  const messageKeys = {
    PLAN_NOT_FOUND: ["notFoundTitle", "notFoundDescription"],
    PLAN_ACCESS_DENIED: ["deniedTitle", "deniedDescription"],
    DATA_UNAVAILABLE: ["unavailableTitle", "unavailableDescription"],
  } as const;
  const keys = messageKeys[code as keyof typeof messageKeys];
  const title = keys ? t(keys[0]) : t("failedTitle");
  const description = keys ? t(keys[1]) : code;
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel="h1"
    />
  );
}
