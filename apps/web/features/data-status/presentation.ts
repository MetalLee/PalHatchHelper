import type { InventoryDataStatus } from "@palhatch/contracts";

type DataStatusCopy = (
  key:
    | "healthyTitle"
    | "healthyDescription"
    | "staleTitle"
    | "staleDescription"
    | "parseErrorTitle"
    | "parseErrorDescription"
    | "emptyTitle"
    | "emptyDescription"
    | "publishedTitle"
    | "publishedDescription"
    | "notConfiguredTitle"
    | "notConfiguredDescription"
    | "reviewPendingTitle"
    | "reviewPendingDescription"
    | "blockedTitle"
    | "blockedDescription",
) => string;

export function dataStatusPresentation(
  state: InventoryDataStatus["state"],
  t: DataStatusCopy,
): {
  title: string;
  description: string;
  tone: "good" | "warning" | "danger";
} {
  switch (state) {
    case "healthy":
      return {
        title: t("healthyTitle"),
        description: t("healthyDescription"),
        tone: "good",
      };
    case "stale":
      return {
        title: t("staleTitle"),
        description: t("staleDescription"),
        tone: "warning",
      };
    case "parse_error":
      return {
        title: t("parseErrorTitle"),
        description: t("parseErrorDescription"),
        tone: "danger",
      };
    case "empty":
      return {
        title: t("emptyTitle"),
        description: t("emptyDescription"),
        tone: "warning",
      };
  }
}

export function gameDataStatusPresentation(
  state: InventoryDataStatus["game_data_state"],
  t: DataStatusCopy,
): {
  title: string;
  description: string;
  tone: "good" | "warning" | "danger";
} {
  switch (state) {
    case "published":
      return {
        title: t("publishedTitle"),
        description: t("publishedDescription"),
        tone: "good",
      };
    case "not_configured":
      return {
        title: t("notConfiguredTitle"),
        description: t("notConfiguredDescription"),
        tone: "warning",
      };
    case "review_pending":
      return {
        title: t("reviewPendingTitle"),
        description: t("reviewPendingDescription"),
        tone: "warning",
      };
    case "blocked":
      return {
        title: t("blockedTitle"),
        description: t("blockedDescription"),
        tone: "danger",
      };
  }
}
