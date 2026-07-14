"use client";

import type { PalInventoryPage, Phase5ErrorCode } from "@palhatch/contracts";
import { useState } from "react";

const genderLabels = {
  male: "雄性",
  female: "雌性",
  genderless: "无性别",
  unknown: "未知性别",
} as const;

const locationLabels = {
  player_party: "队伍",
  player_storage: "终端",
  base: "据点",
  viewing_cage: "观赏笼",
  unknown: "未知位置",
} as const;

type ToggleShare = (
  palInstanceUid: string,
  enabled: boolean,
) => void | Promise<void>;

export function PalInventory({
  page,
  onToggleShare,
}: Readonly<{ page: PalInventoryPage; onToggleShare?: ToggleShare }>) {
  const [items, setItems] = useState(page.items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<Phase5ErrorCode | null>(null);

  async function toggle(palInstanceUid: string, enabled: boolean) {
    setPendingId(palInstanceUid);
    setErrorCode(null);
    try {
      if (onToggleShare !== undefined) {
        await onToggleShare(palInstanceUid, enabled);
      } else {
        const response = await fetch(
          `/api/pals/${encodeURIComponent(palInstanceUid)}/share`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled }),
            cache: "no-store",
          },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          setErrorCode(
            typeof payload === "object" &&
              payload !== null &&
              "error_code" in payload &&
              payload.error_code === "PAL_NOT_OWNED"
              ? "PAL_NOT_OWNED"
              : "DATA_UNAVAILABLE",
          );
          return;
        }
      }
      setItems((current) =>
        current.map((item) =>
          item.pal_instance_uid === palInstanceUid
            ? { ...item, share_enabled: enabled }
            : item,
        ),
      );
    } catch {
      setErrorCode("DATA_UNAVAILABLE");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      {page.catalog_state === "not_configured" ? (
        <div
          className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          游戏目录尚未配置；当前仅显示和搜索稳定 ID，名称与图鉴编号暂不可用。
        </div>
      ) : null}
      <p className="mb-4 text-sm text-slate-400" aria-live="polite">
        共 {page.total_count} 只可见帕鲁
      </p>
      {errorCode !== null ? (
        <p
          className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          {errorCode === "PAL_NOT_OWNED"
            ? "只有当前拥有者可以修改共享状态。"
            : "共享状态更新失败，请稍后重试。"}
        </p>
      ) : null}
      <div className="pal-grid">
        {items.map((pal) => (
          <article className="pal-card" key={pal.pal_instance_uid}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow flex flex-wrap gap-2">
                  {pal.encyclopedia_no === null ? null : (
                    <span>#{String(pal.encyclopedia_no).padStart(3, "0")}</span>
                  )}
                  <span>{pal.pal_id}</span>
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-white">
                  {pal.pal_display_name}
                </h2>
                {pal.catalog_entry_state === "resolved" ? null : (
                  <p className="mt-1 text-xs text-amber-200">未解析目录项</p>
                )}
              </div>
              <span className="level-chip">Lv. {pal.level ?? "—"}</span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
              <div>
                <dt className="detail-label">所有者</dt>
                <dd className="mt-1 truncate text-slate-200">
                  {pal.owner_display_name}
                </dd>
              </div>
              <div>
                <dt className="detail-label">性别</dt>
                <dd className="mt-1 text-slate-200">
                  {genderLabels[pal.gender]}
                </dd>
              </div>
              <div>
                <dt className="detail-label">位置</dt>
                <dd className="mt-1 text-slate-200">
                  {pal.location_name ?? locationLabels[pal.location_type]}
                </dd>
              </div>
              <div>
                <dt className="detail-label">共享状态</dt>
                <dd className="mt-1 text-slate-200">
                  {pal.share_enabled ? "公会可用" : "仅自己"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2" aria-label="被动技能">
              {pal.passive_display_names.length > 0 ? (
                pal.passive_display_names.map((passive, index) => (
                  <span
                    className="passive-chip"
                    key={pal.passive_skill_ids[index]}
                  >
                    {pal.unknown_passive_skill_ids.includes(
                      pal.passive_skill_ids[index] ?? "",
                    )
                      ? `未知被动：${passive}`
                      : passive}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">无已识别被动</span>
              )}
            </div>

            <div className="mt-5 border-t border-white/8 pt-4">
              {pal.is_owned_by_requester ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={pal.share_enabled}
                  aria-label={`${pal.pal_display_name} 公会共享`}
                  className="share-switch-row"
                  disabled={pendingId === pal.pal_instance_uid}
                  onClick={() =>
                    void toggle(pal.pal_instance_uid, !pal.share_enabled)
                  }
                >
                  <span>公会共享</span>
                  <span
                    className={`share-switch ${pal.share_enabled ? "share-switch-on" : ""}`}
                    aria-hidden="true"
                  >
                    <span />
                  </span>
                </button>
              ) : (
                <p className="text-xs text-slate-500">
                  共享帕鲁仅显示状态，不提供修改操作
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
