import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import {
  dataStatusPresentation,
  gameDataStatusPresentation,
} from "@/features/data-status/presentation";
import {
  getInventoryDataStatus,
  Phase5DataError,
} from "@/features/pals/server";

export const dynamic = "force-dynamic";

function displayTime(value: string | null): string {
  if (value === null) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

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
  const presentation = dataStatusPresentation(data.state);
  const gameDataPresentation = gameDataStatusPresentation(data.game_data_state);
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">DATA HEALTH</p>
          <h1>数据状态</h1>
          <p>仅展示安全同步摘要，不包含原始存档字段或服务器文件路径。</p>
        </div>
      </header>
      <section
        className={`status-hero status-hero-${presentation.tone}`}
        role="status"
      >
        <span
          className={`status-dot status-${presentation.tone}`}
          aria-hidden="true"
        />
        <div>
          <h2>{presentation.title}</h2>
          <p>{presentation.description}</p>
        </div>
      </section>
      <section
        className={`status-hero status-hero-${gameDataPresentation.tone}`}
        role="status"
      >
        <span
          className={`status-dot status-${gameDataPresentation.tone}`}
          aria-hidden="true"
        />
        <div>
          <h2>{gameDataPresentation.title}</h2>
          <p>{gameDataPresentation.description}</p>
        </div>
      </section>
      <dl className="detail-grid">
        <div>
          <dt>库存快照</dt>
          <dd>{data.snapshot_id ?? "暂无"}</dd>
        </div>
        <div>
          <dt>快照时间</dt>
          <dd>{displayTime(data.captured_at)}</dd>
        </div>
        <div>
          <dt>存档修改时间</dt>
          <dd>{displayTime(data.source_modified_at)}</dd>
        </div>
        <div>
          <dt>最近同步尝试</dt>
          <dd>{displayTime(data.last_attempt_at)}</dd>
        </div>
        <div>
          <dt>Parser</dt>
          <dd>
            {data.parser_name === null
              ? "暂无"
              : `${data.parser_name} · ${data.parser_version ?? "unknown"}`}
          </dd>
        </div>
        <div>
          <dt>稳定错误码</dt>
          <dd>{data.error_code ?? "无"}</dd>
        </div>
        <div>
          <dt>游戏数据版本</dt>
          <dd>{data.game_data_version_id ?? "未配置"}</dd>
        </div>
        <div>
          <dt>游戏版本 / Build</dt>
          <dd>
            {data.game_version ?? "未知"} · {data.game_build_id ?? "未知"}
          </dd>
        </div>
        <div>
          <dt>确定性算法版本</dt>
          <dd>{data.algorithm_version ?? "未配置"}</dd>
        </div>
      </dl>
      {data.using_previous_snapshot ? (
        <p className="notice-banner" role="alert">
          当前使用上一份有效库存；不会展示或部分发布失败解析结果。
        </p>
      ) : null}
    </div>
  );
}
