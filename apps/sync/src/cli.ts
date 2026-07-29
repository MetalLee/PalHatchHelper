import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { DeviceAuthorizationError, pairDevice } from "./api.js";
import { helpText, parseArguments } from "./cli-options.js";
import {
  deleteConfig,
  formatStatus,
  loadConfig,
  saveConfig,
  type SyncConfig,
} from "./config.js";
import { findWorldSave } from "./discovery.js";
import { assertSupportedPlatform } from "./platform.js";
import { syncOnce } from "./sync.js";
import { VERSION } from "./version.js";

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (error instanceof DeviceAuthorizationError) {
    console.error(
      "设备授权已失效或被撤销，请执行 palbeacon-sync init 重新配对。",
    );
  } else {
    console.error(`操作失败：${friendlyError(message)}`);
  }
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  if (command === "init") await initialize(parseArguments(arguments_));
  else if (command === "run") await runContinuously();
  else if (command === "sync") {
    if (!arguments_.includes("--once")) throw new Error("SYNC_ONCE_REQUIRED");
    await runSingleSync();
  } else if (command === "status")
    console.log(formatStatus(await loadConfig()));
  else if (command === "logout") {
    await deleteConfig();
    console.log(
      "本地设备凭据已删除。如需立即阻止服务器端上传，请同时在 PalBeacon 账户页撤销设备。",
    );
  } else throw new Error("COMMAND_UNKNOWN");
}

async function initialize(options: Map<string, string>): Promise<void> {
  assertSupportedPlatform();
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const baseUrl = normalizeBaseUrl(
      options.get("url") ??
        (await terminal.question(
          "PalBeacon 地址：https://www.palbeacon.app\n> ",
        )),
    );
    const code = (options.get("code") ?? (await terminal.question("配对码：")))
      .trim()
      .toUpperCase();
    const providedSaveDirectory =
      options.get("save-dir") ??
      (await terminal.question("Palworld 存档目录："));
    const saveDirectory = await findWorldSave(providedSaveDirectory.trim());
    const intervalSeconds = integerOption(
      options.get("interval") ?? "300",
      30,
      86_400,
    );
    const deviceName = (options.get("device-name") ?? hostname())
      .trim()
      .slice(0, 120);
    if (deviceName.length === 0) throw new Error("DEVICE_NAME_INVALID");
    const paired = await pairDevice(baseUrl, {
      code,
      device_name: deviceName,
      platform: "linux-x64",
      app_version: VERSION,
    });
    const config: SyncConfig = {
      config_version: 2,
      api_base_url: paired.api_base_url,
      device_id: paired.device_id,
      device_token: paired.device_token,
      save_dir: saveDirectory,
      interval_seconds: intervalSeconds,
      device_name: deviceName,
      app_version: VERSION,
    };
    const path = await saveConfig(config);
    console.log(`配对成功。配置已安全保存到 ${path}`);
    const syncImmediately = parseBooleanChoice(
      options.get("sync-now") ??
        (stdin.isTTY
          ? await terminal.question("是否立即执行首次同步？[y/N]：")
          : "no"),
    );
    if (syncImmediately) {
      const result = await syncOnce(config);
      console.log(syncResultMessage(result));
    } else {
      console.log(
        "可执行 palbeacon-sync sync --once 立即同步，或 palbeacon-sync run 定时运行。",
      );
    }
  } finally {
    terminal.close();
  }
}

async function runSingleSync(): Promise<void> {
  assertSupportedPlatform();
  const result = await syncOnce(await loadConfig());
  console.log(syncResultMessage(result));
}

async function runContinuously(): Promise<void> {
  assertSupportedPlatform();
  const config = await loadConfig();
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`开始定时同步，每 ${config.interval_seconds} 秒检查一次。`);
  try {
    while (!stopping) {
      try {
        const result = await syncOnce(config);
        console.log(syncResultMessage(result));
      } catch (error) {
        if (error instanceof DeviceAuthorizationError) throw error;
        console.error(
          `本轮同步失败：${friendlyError(error instanceof Error ? error.message : "UNKNOWN_ERROR")}`,
        );
      }
      if (!stopping)
        await interruptibleDelay(
          config.interval_seconds * 1000,
          () => stopping,
        );
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    console.log("同步已安全停止。");
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:"))
    throw new Error("API_URL_INVALID");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("API_URL_INVALID");
  }
  return url.origin;
}

function parseBooleanChoice(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "是"].includes(normalized)) return true;
  if (["", "no", "n", "否"].includes(normalized)) return false;
  throw new Error("SYNC_NOW_INVALID");
}

function syncResultMessage(result: "uploaded" | "unchanged"): string {
  return result === "uploaded" ? "存档同步完成。" : "存档未变化，心跳已发送。";
}

function integerOption(
  value: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error("INTERVAL_INVALID");
  return parsed;
}

async function interruptibleDelay(
  milliseconds: number,
  stopped: () => boolean,
): Promise<void> {
  const end = Date.now() + milliseconds;
  while (!stopped() && Date.now() < end) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, end - Date.now())),
    );
  }
}

function friendlyError(code: string): string {
  const messages: Record<string, string> = {
    ARGUMENTS_INVALID: "参数格式无效，请使用 --help 查看示例。",
    COMMAND_UNKNOWN: "未知命令，请使用 --help 查看可用命令。",
    SYNC_ONCE_REQUIRED: "请使用 palbeacon-sync sync --once。",
    SAVE_DIRECTORY_INVALID: "存档目录不存在、不是目录或是符号链接。",
    WORLD_SAVE_NOT_FOUND: "没有在指定目录中找到 Level.sav。",
    MULTIPLE_WORLD_SAVES_FOUND:
      "发现多个世界存档，请将 --save-dir 指向唯一世界目录。",
    SAVE_SOURCE_UNSTABLE: "存档正在写入，本轮已安全跳过。",
    SAVE_FILE_TOO_LARGE: "存档文件超过安全大小上限。",
    SAVE_SIZE_LIMIT_INVALID: "存档大小上限配置无效。",
    PARSER_TIMEOUT: "Parser 超时并已终止。",
    API_URL_INVALID: "PalBeacon 地址无效；公网地址必须使用 HTTPS。",
    INTERVAL_INVALID: "同步间隔必须是 30 到 86400 秒之间的整数。",
    SYNC_NOW_INVALID: "--sync-now 只接受 yes 或 no。",
  };
  return messages[code] ?? code;
}

function printHelp(): void {
  console.log(helpText(VERSION));
}
