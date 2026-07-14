import type { Phase5ErrorCode } from "@palhatch/contracts";

export function LoadingState({ label }: Readonly<{ label: string }>) {
  return (
    <div className="state-card animate-pulse" role="status" aria-live="polite">
      <span className="state-orb" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <section className="state-card text-center">
      <span className="state-orb mx-auto" aria-hidden="true" />
      <h2 className="mt-4 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </section>
  );
}

const errorContent: Partial<Record<Phase5ErrorCode, [string, string]>> = {
  PLAYER_BINDING_REQUIRED: [
    "尚未绑定游戏角色",
    "管理员完成角色绑定后，这里会显示你的库存和公会共享帕鲁。",
  ],
  FORBIDDEN: ["没有权限", "当前账号不能读取或修改这项数据。"],
  AUTH_REQUIRED: ["登录已失效", "请重新登录后继续。"],
  PAL_NOT_OWNED: ["不能修改共享状态", "只有当前拥有者可以修改这只帕鲁。"],
  DATA_UNAVAILABLE: [
    "数据暂不可用",
    "请稍后重试；不会回退到不安全的数据来源。",
  ],
};

export function ErrorState({ code }: Readonly<{ code: Phase5ErrorCode }>) {
  const [title, description] = errorContent[code] ?? [
    "请求未完成",
    "输入或当前状态不符合要求，请检查后重试。",
  ];
  return (
    <section className="state-card border-rose-300/20" role="alert">
      <p className="eyebrow text-rose-200">{code}</p>
      <h2 className="mt-3 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </section>
  );
}
