import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/layout/page-hero";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { requireUserContext } from "@/features/auth/server";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreederForm } from "@/features/breeder/breeder-form";
import { BreederFlowProgress } from "@/features/breeder/components/breeder-flow-progress";
import {
  BreederDataError,
  loadBreederFormContext,
} from "@/features/breeder/server";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function BreederPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Breeder" });
  const user = await requireUserContext();
  if (user.binding === null) return <PlayerBindingSetup />;
  let context;
  try {
    context = await loadBreederFormContext(undefined, catalogLocaleFor(locale));
  } catch (error) {
    return (
      <BreederError
        code={
          error instanceof BreederDataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  return (
    <div className="grid min-w-0 gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        className="min-h-[16rem] border-white/80 bg-white/74 sm:min-h-[17rem]"
        background={<ForestScenery variant="hero" />}
      />
      <BreederFlowProgress />
      <div className="min-w-0">
        <BreederForm context={context} />
      </div>
    </div>
  );
}
