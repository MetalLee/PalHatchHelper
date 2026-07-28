import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import { DataStatusDashboard } from "@/features/data-status/data-status-dashboard";
import {
  getInventoryDataStatus,
  Phase5DataError,
} from "@/features/pals/server";

export const dynamic = "force-dynamic";

export default async function DataStatusPage() {
  const context = await requireUserContext();
  if (context.binding === null)
    return <ErrorState code="PLAYER_BINDING_REQUIRED" />;
  let data;
  try {
    data = await getInventoryDataStatus();
  } catch (error) {
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  return <DataStatusDashboard data={data} />;
}
