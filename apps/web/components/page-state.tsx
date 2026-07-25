import type { Phase5ErrorCode } from "@palhatch/contracts";

import { PageEmpty } from "@/components/states/page-empty";
import { PageError } from "@/components/states/page-error";
import { PageLoading } from "@/components/states/page-loading";

export function LoadingState({ label }: Readonly<{ label: string }>) {
  return <PageLoading label={label} />;
}

export function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return <PageEmpty title={title} description={description} />;
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

export function ErrorState({
  code,
  headingLevel = "h1",
}: Readonly<{
  code: Phase5ErrorCode;
  headingLevel?: "h1" | "h2" | "h3";
}>) {
  const [title, description] = errorContent[code] ?? [
    "请求未完成",
    "输入或当前状态不符合要求，请检查后重试。",
  ];
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel={headingLevel}
    />
  );
}
