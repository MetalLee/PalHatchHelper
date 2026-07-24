import type { PalInventoryPage } from "@palhatch/contracts";
import Link from "next/link";

import type { PalListQuery } from "./query";

const scopes = [
  ["all", "全部"],
  ["mine", "我的帕鲁"],
  ["shared", "公会共享"],
] as const;

const genderLabels = {
  male: "雄性",
  female: "雌性",
  genderless: "无性别",
  unknown: "未知",
} as const;

const locationLabels = {
  player_party: "队伍",
  player_storage: "终端",
  base: "据点",
  dimensional_storage: "次元仓库",
  viewing_cage: "观赏笼",
  unknown: "未知",
} as const;

function scopeHref(scope: string): string {
  return `/pals?scope=${scope}`;
}

export function PalFilters({
  query,
  page,
}: Readonly<{ query: PalListQuery; page: PalInventoryPage }>) {
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
            {page.filter_options.owners.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>性别</span>
          <select name="gender" defaultValue={query.gender}>
            <option value="">全部性别</option>
            {page.filter_options.genders.map((gender) => (
              <option key={gender} value={gender}>
                {genderLabels[gender]}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>被动</span>
          <select name="passive" defaultValue={query.passive}>
            <option value="">全部被动</option>
            {page.filter_options.passives.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>位置</span>
          <select name="location" defaultValue={query.location}>
            <option value="">全部位置</option>
            {page.filter_options.locations.map((location) => (
              <option key={location} value={location}>
                {locationLabels[location]}
              </option>
            ))}
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
