"use client";

import { PageError } from "@/components/states/page-error";
import { useCopy } from "@/i18n/client";

export function BreederError({ code }: Readonly<{ code: string }>) {
  const t = useCopy("Breeder");
  const content = {
    PLAYER_BINDING_REQUIRED: ["bindingTitle", "bindingDescription"],
    ACTIVE_INVENTORY_SNAPSHOT_REQUIRED: [
      "inventoryUnavailableTitle",
      "inventoryUnavailableDescription",
    ],
    PUBLISHED_GAME_DATA_VERSION_REQUIRED: [
      "gameUnavailableTitle",
      "gameUnavailableDescription",
    ],
    ACTIVE_SCORING_PROFILE_REQUIRED: [
      "scoringUnavailableTitle",
      "scoringUnavailableDescription",
    ],
    JOB_NOT_FOUND: ["jobNotFoundTitle", "jobNotFoundDescription"],
    FORBIDDEN: ["forbiddenTitle", "forbiddenDescription"],
    DATA_UNAVAILABLE: ["dataUnavailableTitle", "dataUnavailableDescription"],
  } as const;
  const keys = content[code as keyof typeof content];
  const title = keys ? t(keys[0]) : t("requestFailedTitle");
  const description = keys ? t(keys[1]) : t("requestFailedDescription");
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel="h1"
      className="mx-auto max-w-2xl"
    />
  );
}
