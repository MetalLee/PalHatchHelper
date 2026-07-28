"use client";

import type { Phase5ErrorCode } from "@palhatch/contracts";

import { PageEmpty } from "@/components/states/page-empty";
import { PageError } from "@/components/states/page-error";
import { PageLoading } from "@/components/states/page-loading";
import { useCopy } from "@/i18n/client";

export function LoadingState({ label }: Readonly<{ label: string }>) {
  return <PageLoading label={label} />;
}

export function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return <PageEmpty title={title} description={description} />;
}

export function ErrorState({
  code,
  headingLevel = "h1",
}: Readonly<{
  code: Phase5ErrorCode;
  headingLevel?: "h1" | "h2" | "h3";
}>) {
  const t = useCopy("Errors");
  const errorContent: Partial<Record<Phase5ErrorCode, [string, string]>> = {
    PLAYER_BINDING_REQUIRED: [t("bindingTitle"), t("bindingDescription")],
    FORBIDDEN: [t("forbiddenTitle"), t("forbiddenDescription")],
    AUTH_REQUIRED: [t("authTitle"), t("authDescription")],
    PAL_NOT_OWNED: [t("notOwnedTitle"), t("notOwnedDescription")],
    DATA_UNAVAILABLE: [t("dataTitle"), t("dataDescription")],
  };
  const [title, description] = errorContent[code] ?? [
    t("requestTitle"),
    t("requestDescription"),
  ];
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel={headingLevel}
    />
  );
}
