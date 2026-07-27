import { requireUserContext } from "@/features/auth/server";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreedingJobView } from "@/features/breeder/breeding-job-view";
import { BreederDataError, loadBreedingJob } from "@/features/breeder/server";
import { userFacingCatalogName } from "@/lib/user-facing-name";

export const dynamic = "force-dynamic";

export default async function BreedingJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireUserContext();
  if (user.binding === null)
    return <BreederError code="PLAYER_BINDING_REQUIRED" />;
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId))
    return <BreederError code="JOB_NOT_FOUND" />;
  let result;
  try {
    result = await loadBreedingJob(jobId);
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
    )?.display_name ?? "目标帕鲁";
  const targetName = userFacingCatalogName(
    localizedTargetName,
    result.data.target_pal_id,
    "目标帕鲁",
  );
  return (
    <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip pb-4 sm:gap-8">
      <h1 className="sr-only">{targetName}的方案推荐与配种路径</h1>
      <BreedingJobView initialResult={result} />
    </div>
  );
}
