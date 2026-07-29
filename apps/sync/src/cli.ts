import { realpathSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { DeviceAuthorizationError, pairDevice } from "./api.js";
import {
  helpText,
  parseArguments,
  parseInspectArguments,
} from "./cli-options.js";
import {
  deleteConfig,
  formatStatus,
  loadConfig,
  saveConfig,
  type SyncConfig,
} from "./config.js";
import { findWorldSave } from "./discovery.js";
import { inspectSave } from "./inspect.js";
import { assertSupportedPlatform } from "./platform.js";
import { syncOnce } from "./sync.js";
import { VERSION } from "./version.js";

export const DEFAULT_API_BASE_URL = "https://www.palbeacon.app";

export interface InitRuntime {
  isInteractive: boolean;
  assertSupportedPlatform: () => void;
  question: (prompt: string) => Promise<string>;
  loadConfig: () => Promise<SyncConfig>;
  findWorldSave: typeof findWorldSave;
  pairDevice: typeof pairDevice;
  saveConfig: typeof saveConfig;
  hostname: () => string;
  log: (message: string) => void;
}

type SupportedSignal = "SIGINT" | "SIGTERM";

export interface RunRuntime {
  loadConfig: () => Promise<SyncConfig>;
  syncOnce: typeof syncOnce;
  log: (message: string) => void;
  error: (message: string) => void;
  addSignalListener: (signal: SupportedSignal, listener: () => void) => void;
  removeSignalListener: (signal: SupportedSignal, listener: () => void) => void;
  wait: (milliseconds: number, stopped: () => boolean) => Promise<void>;
}

if (isDirectExecution()) void main().catch(handleFatalError);

function handleFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (error instanceof DeviceAuthorizationError) {
    console.error(
      "设备授权已失效或被撤销，请执行 palbeacon-sync init 重新配对。",
    );
  } else {
    console.error(`操作失败：${friendlyError(error, message)}`);
  }
  process.exitCode = 1;
}

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
  if (command === "init") {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      await initialize(parseArguments(arguments_), {
        isInteractive: stdin.isTTY,
        assertSupportedPlatform,
        question: (prompt) => terminal.question(prompt),
        loadConfig,
        findWorldSave,
        pairDevice,
        saveConfig,
        hostname,
        log: console.log,
      });
    } finally {
      terminal.close();
    }
  } else if (command === "run") {
    assertSupportedPlatform();
    await runContinuously(defaultRunRuntime());
  } else if (command === "sync") {
    if (!arguments_.includes("--once")) throw new Error("SYNC_ONCE_REQUIRED");
    await runSingleSync();
  } else if (command === "inspect") {
    assertSupportedPlatform();
    const outputs = parseInspectArguments(arguments_);
    await inspectSave(outputs);
    console.log(`离线检查完成：${outputs.canonicalOutput}`);
    console.log(`脱敏上传载荷：${outputs.payloadOutput}`);
  } else if (command === "status")
    console.log(formatStatus(await loadConfig()));
  else if (command === "logout") {
    await deleteConfig();
    console.log(
      "本地设备凭据已删除。如需立即阻止服务器端上传，请同时在 PalBeacon 账户页撤销设备。",
    );
  } else throw new Error("COMMAND_UNKNOWN");
}

export async function initialize(
  options: Map<string, string>,
  runtime: InitRuntime,
): Promise<void> {
  runtime.assertSupportedPlatform();
  const hasExistingConfig =
    options.get("force") === "true"
      ? false
      : await existingConfig(runtime.loadConfig);
  if (hasExistingConfig && options.get("force") !== "true") {
    if (!runtime.isInteractive) throw new Error("CONFIG_ALREADY_EXISTS");
    const replace = parseConfirmation(
      await runtime.question(
        "本机已经完成配对。继续会替换当前设备配置，是否继续？[y/N]\n> ",
      ),
    );
    if (!replace) {
      runtime.log("已取消，当前设备配置保持不变。");
      return;
    }
  }

  if (
    !runtime.isInteractive &&
    (options.get("code") === undefined || options.get("save-dir") === undefined)
  )
    throw new Error("ARGUMENTS_INVALID");

  const baseUrl = normalizeBaseUrl(options.get("url") ?? DEFAULT_API_BASE_URL);
  const code = (
    options.get("code") ??
    (await runtime.question("请输入 PalBeacon 配对码：\n> "))
  )
    .trim()
    .toUpperCase();
  const providedSaveDirectory =
    options.get("save-dir") ??
    (await runtime.question("请输入 Palworld 存档目录：\n> "));
  const saveDirectory = await runtime.findWorldSave(
    providedSaveDirectory.trim(),
  );
  runtime.log("✓ 已找到世界存档");
  const intervalSeconds = integerOption(
    options.get("interval") ?? "300",
    30,
    86_400,
  );
  const deviceName = (options.get("device-name") ?? runtime.hostname())
    .trim()
    .slice(0, 120);
  if (deviceName.length === 0) throw new Error("DEVICE_NAME_INVALID");
  const paired = await runtime.pairDevice(baseUrl, {
    code,
    device_name: deviceName,
    platform: "linux-x64",
    app_version: VERSION,
  });
  runtime.log("✓ 设备配对成功");
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
  await runtime.saveConfig(config);
  runtime.log("✓ 配置已保存");
  for (const line of [
    "",
    "现在运行：",
    "",
    "palbeacon-sync run",
    "",
    "即可开始定时同步。",
  ])
    runtime.log(line);
}

async function runSingleSync(): Promise<void> {
  assertSupportedPlatform();
  const result = await syncOnce(await loadConfig());
  console.log(syncResultMessage(result));
}

export async function runContinuously(runtime: RunRuntime): Promise<void> {
  const config = await runtime.loadConfig();
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  runtime.addSignalListener("SIGINT", stop);
  runtime.addSignalListener("SIGTERM", stop);
  runtime.log(`开始定时同步，每 ${config.interval_seconds} 秒检查一次。`);
  try {
    while (!stopping) {
      try {
        const result = await runtime.syncOnce(config);
        runtime.log(syncResultMessage(result));
      } catch (error) {
        if (error instanceof DeviceAuthorizationError) throw error;
        runtime.error(
          `本轮同步失败：${friendlyError(error, error instanceof Error ? error.message : "UNKNOWN_ERROR")}`,
        );
      }
      if (!stopping)
        await runtime.wait(config.interval_seconds * 1000, () => stopping);
    }
  } finally {
    runtime.removeSignalListener("SIGINT", stop);
    runtime.removeSignalListener("SIGTERM", stop);
    runtime.log("同步已安全停止。");
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

function parseConfirmation(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "是"].includes(normalized)) return true;
  if (["", "no", "n", "否"].includes(normalized)) return false;
  throw new Error("CONFIRMATION_INVALID");
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

function friendlyError(error: unknown, code: string): string {
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
    PARSER_TIMEOUT: "存档解析超时，本轮稍后重试。",
    API_URL_INVALID: "PalBeacon 地址无效；公网地址必须使用 HTTPS。",
    INTERVAL_INVALID: "同步间隔必须是 30 到 86400 秒之间的整数。",
    CONFIG_ALREADY_EXISTS:
      "本机已经完成配对；如需替换配置，请重新运行并添加 --force。",
    SYNC_CONFIG_NOT_FOUND: "本机尚未完成配对，请先执行 palbeacon-sync init。",
    SYNC_CONFIG_INVALID: "本机配置无效，请执行 palbeacon-sync init 重新配对。",
    CONFIRMATION_INVALID: "请输入 y 或 n。",
    INSPECT_OUTPUT_EXISTS: "inspect 输出文件已存在，未覆盖任何文件。",
    INSPECT_OUTPUT_PATH_INVALID: "两个 inspect 输出路径必须不同。",
  };
  if (isMissingFileError(error))
    return "本机尚未完成配对，请先执行 palbeacon-sync init。";
  return messages[code] ?? "发生错误，请稍后重试。";
}

function printHelp(): void {
  console.log(helpText(VERSION));
}

async function existingConfig(
  loader: () => Promise<SyncConfig>,
): Promise<boolean> {
  try {
    await loader();
    return true;
  } catch (error) {
    if (
      isMissingFileError(error) ||
      (error instanceof Error && error.message === "SYNC_CONFIG_NOT_FOUND")
    )
      return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function defaultRunRuntime(): RunRuntime {
  return {
    loadConfig,
    syncOnce,
    log: console.log,
    error: console.error,
    addSignalListener: (signal, listener) => process.once(signal, listener),
    removeSignalListener: (signal, listener) =>
      process.removeListener(signal, listener),
    wait: interruptibleDelay,
  };
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(entry))).href;
  } catch {
    return false;
  }
}
