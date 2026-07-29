import { getTranslations } from "next-intl/server";

import { requireUserContext } from "@/features/auth/server";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreedingJobView } from "@/features/breeder/breeding-job-view";
import { BreederDataError, loadBreedingJob } from "@/features/breeder/server";
import { userFacingCatalogName } from "@/lib/user-facing-name";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function BreedingJobPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null) return <PlayerBindingSetup />;
  const { locale: localeParam, jobId } = await params;
  const locale = requireAppLocale(localeParam);
  const t = await getTranslations({ locale, namespace: "Breeder" });
  if (!/^[0-9a-f-]{36}$/i.test(jobId))
    return <BreederError code="JOB_NOT_FOUND" />;
  let result;
  try {
    result = await loadBreedingJob(jobId, undefined, catalogLocaleFor(locale));
  } catch (error) {
    return (
      <BreederError
        code={
          error instanceof BreederDataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  const localizedTargetName =
    result.data.localization.pals.find(
      (pal) => pal.pal_id === result.data.target_pal_id,
    )?.display_name ?? t("targetFallback");
  const targetName = userFacingCatalogName(
    localizedTargetName,
    result.data.target_pal_id,
    t("targetFallback"),
  );
  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8">
      <h1 className="sr-only">{t("jobHeading", { name: targetName })}</h1>
      <BreedingJobView initialResult={result} />
    </div>
  );
}
