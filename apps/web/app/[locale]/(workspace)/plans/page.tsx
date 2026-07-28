import { Sprout } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PageHero } from "@/components/layout/page-hero";
import { ForestScenery } from "@/components/surfaces/forest-scenery";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/features/auth/server";
import { PlanError } from "@/features/plans/plan-error";
import { PlanList } from "@/features/plans/plan-list";
import { PlanDataError, loadPlans } from "@/features/plans/server";
import { Link } from "@/i18n/navigation";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ cursor?: string; boundary?: string }>;
  params: Promise<{ locale: string }>;
}) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Plans" });
  const user = await requireUserContext();
  if (user.binding === null)
    return <PlanError code="PLAYER_BINDING_REQUIRED" />;
  const query = await searchParams;
  let page;
  try {
    page = await loadPlans(
      { cursor: query.cursor, boundary: query.boundary },
      undefined,
      catalogLocaleFor(locale),
    );
  } catch (error) {
    return (
      <PlanError
        code={error instanceof PlanDataError ? error.code : "DATA_UNAVAILABLE"}
      />
    );
  }

  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        className="min-h-[17rem] border-white/80 bg-white/74 sm:min-h-[18rem]"
        background={<ForestScenery variant="hero" />}
        actions={
          <Button asChild size="lg">
            <Link href="/breeder">
              <Sprout aria-hidden="true" className="size-4" />
              {t("start")}
            </Link>
          </Button>
        }
      />
      <PlanList page={page} />
    </div>
  );
}
