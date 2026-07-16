const content: Record<string, [string, string]> = {
  PLAYER_BINDING_REQUIRED: [
    "尚未绑定游戏角色",
    "管理员完成角色绑定后才能创建配种任务。",
  ],
  ACTIVE_INVENTORY_SNAPSHOT_REQUIRED: [
    "没有可用库存快照",
    "请先通过正式同步链路发布一份本地库存快照。",
  ],
  PUBLISHED_GAME_DATA_VERSION_REQUIRED: [
    "没有已发布游戏目录",
    "配种任务只会使用当前 world 的 published 目录。",
  ],
  ACTIVE_SCORING_PROFILE_REQUIRED: [
    "评分配置不可用",
    "四种优化模式必须具有同一算法版本的活动评分配置。",
  ],
  JOB_NOT_FOUND: ["任务不存在", "该任务不存在，或当前账号无权读取。"],
  FORBIDDEN: ["权限不足", "当前账号不能执行这项操作。"],
  DATA_UNAVAILABLE: ["数据暂不可用", "请稍后重试，不会回退到未发布版本。"],
};

export function BreederError({ code }: Readonly<{ code: string }>) {
  const [title, description] = content[code] ?? [
    "请求未完成",
    "当前输入或固定数据状态不满足创建条件。",
  ];
  return (
    <section className="state-card border-rose-300/20" role="alert">
      <p className="eyebrow text-rose-200">{code}</p>
      <h2 className="mt-3 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </section>
  );
}
