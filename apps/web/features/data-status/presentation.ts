import type { InventoryDataStatus } from "@palhatch/contracts";

export function dataStatusPresentation(state: InventoryDataStatus["state"]): {
  title: string;
  description: string;
  tone: "good" | "warning" | "danger";
} {
  switch (state) {
    case "healthy":
      return {
        title: "数据同步正常",
        description: "服务器数据已同步，世界状态清晰可见。",
        tone: "good",
      };
    case "stale":
      return {
        title: "数据已过期",
        description: "库存同步时间超过 15 分钟，请谨慎确认当前持有情况。",
        tone: "warning",
      };
    case "parse_error":
      return {
        title: "存档解析异常",
        description: "最近一次解析失败，当前继续使用上一份有效库存。",
        tone: "danger",
      };
    case "empty":
      return {
        title: "暂无库存数据",
        description: "还没有可供当前角色使用的已发布脱敏库存。",
        tone: "warning",
      };
  }
}

export function gameDataStatusPresentation(
  state: InventoryDataStatus["game_data_state"],
): {
  title: string;
  description: string;
  tone: "good" | "warning" | "danger";
} {
  switch (state) {
    case "published":
      return {
        title: "游戏数据已发布",
        description: "当前世界正在使用已发布的固定游戏数据版本。",
        tone: "good",
      };
    case "not_configured":
      return {
        title: "游戏数据未配置",
        description: "当前世界还没有活动游戏数据版本。",
        tone: "warning",
      };
    case "review_pending":
      return {
        title: "游戏数据待审核",
        description: "存在待审核的配种数据版本，当前仍使用已发布版本。",
        tone: "warning",
      };
    case "blocked":
      return {
        title: "游戏数据受阻",
        description: "候选版本校验失败或算法配置不完整。",
        tone: "danger",
      };
  }
}
