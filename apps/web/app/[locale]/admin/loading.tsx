import { LoadingState } from "@/components/page-state";
import { getTranslations } from "next-intl/server";

export default async function AdminLoading() {
  const t = await getTranslations("Errors");
  return <LoadingState label={t("adminLoading")} />;
}
