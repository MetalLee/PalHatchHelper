import { requireUserContext } from "@/features/auth/server";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreedingJobView } from "@/features/breeder/breeding-job-view";
import { BreederDataError, loadBreedingJob } from "@/features/breeder/server";

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
  return (
    <div className="page-stack min-w-0">
      <header className="page-header">
        <div className="min-w-0">
          <p className="eyebrow">BREEDING JOB</p>
          <h1>路线比较</h1>
          <p className="break-all">{jobId}</p>
        </div>
      </header>
      <BreedingJobView initialResult={result} />
    </div>
  );
}
