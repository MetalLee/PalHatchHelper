import { requireUserContext } from "@/features/auth/server";
import { BreederError } from "@/features/breeder/breeder-error";
import { BreederForm } from "@/features/breeder/breeder-form";
import {
  BreederDataError,
  loadBreederFormContext,
} from "@/features/breeder/server";

export const dynamic = "force-dynamic";

export default async function BreederPage() {
  const user = await requireUserContext();
  if (user.binding === null)
    return <BreederError code="PLAYER_BINDING_REQUIRED" />;
  let context;
  try {
    context = await loadBreederFormContext();
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
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">DETERMINISTIC BREEDER</p>
          <h1>配种器</h1>
          <p>创建固定库存、目录、算法和评分版本的异步配种任务。</p>
        </div>
      </header>
      <BreederForm context={context} />
    </div>
  );
}
