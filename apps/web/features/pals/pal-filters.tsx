import type { PalInventoryPage } from "@palhatch/contracts";
import Link from "next/link";

import type { PalListQuery } from "./query";

const scopes = [
  ["all", "全部"],
  ["mine", "我的帕鲁"],
  ["shared", "公会共享"],
] as const;

function scopeHref(scope: string): string {
  return `/pals?scope=${scope}`;
}

export function PalFilters({
  query,
  page,
}: Readonly<{ query: PalListQuery; page: PalInventoryPage }>) {
  const owners = Array.from(
    new Map(
      page.items.map((item) => [
        item.owner_filter_key,
        item.owner_display_name,
      ]),
    ),
  );
  const passives = Array.from(
    new Map(
      page.items.flatMap((item) =>
        item.passive_skill_ids.map((id, index) => [
          id,
          item.passive_display_names[index] ?? id,
        ]),
      ),
    ),
  );

  return (
    <section className="filter-panel" aria-label="库存筛选">
      <div className="scope-tabs" aria-label="库存范围">
        {scopes.map(([scope, label]) => (
          <Link
            key={scope}
            href={scopeHref(scope)}
            aria-current={query.scope === scope ? "page" : undefined}
            className={query.scope === scope ? "scope-tab-active" : "scope-tab"}
          >
            {label}
          </Link>
        ))}
      </div>
      <form action="/pals" method="get" className="filter-grid">
        <input type="hidden" name="scope" value={query.scope} />
        <label className="filter-field filter-search">
          <span>名称、图鉴编号或稳定 ID</span>
          <input
            type="search"
            name="query"
            defaultValue={query.query}
            placeholder="例如：棉悠悠 / 1 / test_parent_a"
          />
        </label>
        <label className="filter-field">
          <span>所有者</span>
          <select name="owner" defaultValue={query.owner}>
            <option value="">全部所有者</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>性别</span>
          <select name="gender" defaultValue={query.gender}>
            <option value="">全部性别</option>
            <option value="male">雄性</option>
            <option value="female">雌性</option>
            <option value="genderless">无性别</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <label className="filter-field">
          <span>被动</span>
          <select name="passive" defaultValue={query.passive}>
            <option value="">全部被动</option>
            {passives.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>位置</span>
          <select name="location" defaultValue={query.location}>
            <option value="">全部位置</option>
            <option value="player_party">队伍</option>
            <option value="player_storage">终端</option>
            <option value="base">据点</option>
            <option value="viewing_cage">观赏笼</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <label className="filter-field">
          <span>共享状态</span>
          <select
            name="shared"
            defaultValue={query.shared === null ? "" : String(query.shared)}
          >
            <option value="">全部状态</option>
            <option value="true">公会可用</option>
            <option value="false">仅自己</option>
          </select>
        </label>
        <button className="primary-button self-end" type="submit">
          应用筛选
        </button>
      </form>
    </section>
  );
}
