const content: Record<string, [string, string]> = {
  PLAYER_BINDING_REQUIRED: [
    "尚未绑定游戏角色",
    "管理员完成角色绑定后才能创建配种任务。",
  ],
  ACTIVE_INVENTORY_SNAPSHOT_REQUIRED: [
    "库存数据暂不可用",
    "请等待下一次库存同步完成后再试。",
  ],
  PUBLISHED_GAME_DATA_VERSION_REQUIRED: [
    "游戏数据暂不可用",
    "管理员准备好游戏数据后即可创建配种任务。",
  ],
  ACTIVE_SCORING_PROFILE_REQUIRED: [
    "推荐设置暂不可用",
    "请联系管理员完善四种路线偏好设置。",
  ],
  JOB_NOT_FOUND: ["任务不存在", "该任务不存在，或当前账号无权读取。"],
  FORBIDDEN: ["权限不足", "当前账号不能执行这项操作。"],
  DATA_UNAVAILABLE: ["数据暂不可用", "请稍后重试。"],
};

export function BreederError({ code }: Readonly<{ code: string }>) {
  const [title, description] = content[code] ?? [
    "请求未完成",
    "请检查当前设置后重试。",
  ];
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel="h1"
      className="mx-auto max-w-2xl"
    />
  );
}
import { PageError } from "@/components/states/page-error";
