export const CLI_LOCALES = ["en", "zh-CN"] as const;

export type CliLocale = (typeof CLI_LOCALES)[number];

export interface LocaleEnvironment {
  LC_ALL?: string;
  LC_MESSAGES?: string;
  LANG?: string;
}

export interface LocalizedMessages {
  description: string;
  commandsHeading: string;
  gettingStartedHeading: string;
  localeHint: string;
  commands: Record<"init" | "run" | "status" | "logout", string>;
  authorizationRevoked: string;
  fatalPrefix: string;
  replacePrompt: string;
  cancelled: string;
  pairingCodePrompt: string;
  saveDirectoryPrompt: string;
  saveFound: string;
  paired: string;
  configSaved: string;
  runNext: readonly string[];
  runStarted: (seconds: number) => string;
  syncFailed: (message: string) => string;
  stopped: string;
  uploaded: string;
  unchanged: string;
  inspectComplete: (path: string) => string;
  inspectPayload: (path: string) => string;
  loggedOut: string;
  status: {
    server: string;
    device: string;
    save: string;
    interval: string;
    lastResult: string;
    lastTime: string;
    seconds: string;
    never: string;
  };
  errors: Record<string, string>;
}

export function extractLocaleOption(arguments_: string[]): {
  arguments: string[];
  requestedLocale?: string;
} {
  const remaining: string[] = [];
  let requestedLocale: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== "--locale") {
      if (argument !== undefined) remaining.push(argument);
      continue;
    }
    const value = arguments_[index + 1];
    if (
      requestedLocale !== undefined ||
      value === undefined ||
      value.startsWith("--")
    )
      throw new Error("LOCALE_INVALID");
    requestedLocale = value;
    index += 1;
  }
  return {
    arguments: remaining,
    ...(requestedLocale === undefined ? {} : { requestedLocale }),
  };
}

export function resolveLocale(
  requestedLocale: string | undefined,
  environment: LocaleEnvironment = {
    LC_ALL: process.env.LC_ALL,
    LC_MESSAGES: process.env.LC_MESSAGES,
    LANG: process.env.LANG,
  },
  intlLocale = Intl.DateTimeFormat().resolvedOptions().locale,
): CliLocale {
  if (requestedLocale !== undefined) {
    const locale = normalizeLocale(requestedLocale);
    if (locale === undefined) throw new Error("LOCALE_INVALID");
    return locale;
  }
  for (const candidate of [
    environment.LC_ALL,
    environment.LC_MESSAGES,
    environment.LANG,
  ]) {
    if (candidate === undefined || candidate.trim().length === 0) continue;
    return normalizeLocale(candidate) ?? "en";
  }
  return normalizeLocale(intlLocale) ?? "en";
}

export function messages(locale: CliLocale): LocalizedMessages {
  return locale === "zh-CN" ? ZH_CN_MESSAGES : EN_MESSAGES;
}

function normalizeLocale(value: string): CliLocale | undefined {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return undefined;
}

const EN_MESSAGES: LocalizedMessages = {
  description: "Sync Palworld server saves to PalBeacon.",
  commandsHeading: "Commands:",
  gettingStartedHeading: "Get started:",
  localeHint:
    "Language follows your system. Override with --locale en or --locale zh-CN.",
  commands: {
    init: "Pair with PalBeacon and select a save",
    run: "Sync now and keep watching the save",
    status: "Show the current sync status",
    logout: "Delete this device's local configuration",
  },
  authorizationRevoked:
    "Device authorization has expired or been revoked. Run palbeacon init to pair again.",
  fatalPrefix: "Operation failed: ",
  replacePrompt:
    "This computer is already paired. Continuing will replace the current device configuration. Continue? [y/N]\n> ",
  cancelled: "Cancelled. The current device configuration was not changed.",
  pairingCodePrompt: "Enter the PalBeacon pairing code:\n> ",
  saveDirectoryPrompt: "Enter the Palworld save directory:\n> ",
  saveFound: "✓ World save found",
  paired: "✓ Device paired",
  configSaved: "✓ Configuration saved",
  runNext: [
    "",
    "Now run:",
    "",
    "palbeacon run",
    "",
    "to start scheduled synchronization.",
  ],
  runStarted: (seconds) =>
    `Scheduled synchronization started. Checking every ${seconds} seconds.`,
  syncFailed: (message) => `This sync attempt failed: ${message}`,
  stopped: "Synchronization stopped safely.",
  uploaded: "Save synchronized.",
  unchanged: "Save unchanged; heartbeat sent.",
  inspectComplete: (path) => `Offline inspection complete: ${path}`,
  inspectPayload: (path) => `Redacted upload payload: ${path}`,
  loggedOut:
    "Local device credentials deleted. To stop server-side uploads immediately, also revoke the device from your PalBeacon account.",
  status: {
    server: "Server",
    device: "Device",
    save: "Save",
    interval: "Interval",
    lastResult: "Last result",
    lastTime: "Last time",
    seconds: "seconds",
    never: "Never synchronized",
  },
  errors: {
    ARGUMENTS_INVALID: "Invalid arguments. Use --help for examples.",
    COMMAND_UNKNOWN: "Unknown command. Use --help to list available commands.",
    SYNC_ONCE_REQUIRED: "Use palbeacon sync --once.",
    SAVE_DIRECTORY_INVALID:
      "The save directory does not exist, is not a directory, or is a symbolic link.",
    WORLD_SAVE_NOT_FOUND: "No Level.sav was found in the specified directory.",
    MULTIPLE_WORLD_SAVES_FOUND:
      "Multiple world saves were found. Point --save-dir to one world directory.",
    SAVE_SOURCE_UNSTABLE:
      "The save is currently being written. This attempt was skipped safely.",
    SAVE_FILE_TOO_LARGE: "A save file exceeds the safety size limit.",
    SAVE_SIZE_LIMIT_INVALID: "The save size limit is invalid.",
    PARSER_TIMEOUT: "Save parsing timed out. A later attempt will retry.",
    API_URL_INVALID: "Invalid PalBeacon URL. Public URLs must use HTTPS.",
    INTERVAL_INVALID:
      "The interval must be an integer from 30 to 86400 seconds.",
    DEVICE_NAME_INVALID: "The device name cannot be empty.",
    CONFIG_ALREADY_EXISTS:
      "This computer is already paired. To replace it, run the command again with --force.",
    SYNC_CONFIG_NOT_FOUND:
      "This computer is not paired. Run palbeacon init first.",
    SYNC_CONFIG_INVALID:
      "The local configuration is invalid. Run palbeacon init to pair again.",
    CONFIRMATION_INVALID: "Enter y or n.",
    INSPECT_OUTPUT_EXISTS:
      "An inspect output file already exists; no file was overwritten.",
    INSPECT_OUTPUT_PATH_INVALID: "The two inspect output paths must differ.",
    LOCALE_INVALID: "Unsupported locale. Use en, en-US, zh, or zh-CN.",
    PLATFORM_UNSUPPORTED: "This release supports Linux x64 only.",
    API_RESPONSE_TOO_LARGE: "The PalBeacon response exceeded the safety limit.",
    SAVE_FILE_INVALID: "A save file is invalid or is a symbolic link.",
    PARSER_INPUT_INVALID: "The Parser input is invalid.",
    PARSER_OUTPUT_INVALID: "The Parser returned invalid output.",
    PARSER_OUTPUT_TOO_LARGE: "The Parser output exceeded the safety limit.",
    PARSER_MANIFEST_INVALID: "The bundled Parser manifest is invalid.",
    PARSER_BINARY_INVALID: "The bundled Parser executable is invalid.",
    PARSER_BINARY_HASH_MISMATCH:
      "The bundled Parser failed its integrity check.",
    UNKNOWN_ERROR: "Something went wrong. Try again later.",
  },
};

const ZH_CN_MESSAGES: LocalizedMessages = {
  description: "将 Palworld 服务器存档同步到 PalBeacon。",
  commandsHeading: "命令：",
  gettingStartedHeading: "开始使用：",
  localeHint:
    "语言默认跟随系统。可通过 --locale en 或 --locale zh-CN 手动指定。",
  commands: {
    init: "配对 PalBeacon 并选择存档",
    run: "立即同步并持续监控存档",
    status: "查看当前同步状态",
    logout: "删除本机设备配置",
  },
  authorizationRevoked:
    "设备授权已失效或被撤销，请执行 palbeacon init 重新配对。",
  fatalPrefix: "操作失败：",
  replacePrompt:
    "本机已经完成配对。继续会替换当前设备配置，是否继续？[y/N]\n> ",
  cancelled: "已取消，当前设备配置保持不变。",
  pairingCodePrompt: "请输入 PalBeacon 配对码：\n> ",
  saveDirectoryPrompt: "请输入 Palworld 存档目录：\n> ",
  saveFound: "✓ 已找到世界存档",
  paired: "✓ 设备配对成功",
  configSaved: "✓ 配置已保存",
  runNext: [
    "",
    "现在运行：",
    "",
    "palbeacon run",
    "",
    "即可开始定时同步。",
  ],
  runStarted: (seconds) => `开始定时同步，每 ${seconds} 秒检查一次。`,
  syncFailed: (message) => `本轮同步失败：${message}`,
  stopped: "同步已安全停止。",
  uploaded: "存档同步完成。",
  unchanged: "存档未变化，心跳已发送。",
  inspectComplete: (path) => `离线检查完成：${path}`,
  inspectPayload: (path) => `脱敏上传载荷：${path}`,
  loggedOut:
    "本地设备凭据已删除。如需立即阻止服务器端上传，请同时在 PalBeacon 账户页撤销设备。",
  status: {
    server: "服务器",
    device: "设备",
    save: "存档",
    interval: "间隔",
    lastResult: "最近结果",
    lastTime: "最近时间",
    seconds: "秒",
    never: "尚未同步",
  },
  errors: {
    ARGUMENTS_INVALID: "参数格式无效，请使用 --help 查看示例。",
    COMMAND_UNKNOWN: "未知命令，请使用 --help 查看可用命令。",
    SYNC_ONCE_REQUIRED: "请使用 palbeacon sync --once。",
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
    DEVICE_NAME_INVALID: "设备名称不能为空。",
    CONFIG_ALREADY_EXISTS:
      "本机已经完成配对；如需替换配置，请重新运行并添加 --force。",
    SYNC_CONFIG_NOT_FOUND: "本机尚未完成配对，请先执行 palbeacon init。",
    SYNC_CONFIG_INVALID: "本机配置无效，请执行 palbeacon init 重新配对。",
    CONFIRMATION_INVALID: "请输入 y 或 n。",
    INSPECT_OUTPUT_EXISTS: "inspect 输出文件已存在，未覆盖任何文件。",
    INSPECT_OUTPUT_PATH_INVALID: "两个 inspect 输出路径必须不同。",
    LOCALE_INVALID: "不支持该语言。请使用 en、en-US、zh 或 zh-CN。",
    PLATFORM_UNSUPPORTED: "当前版本仅支持 Linux x64。",
    API_RESPONSE_TOO_LARGE: "PalBeacon 响应超过安全大小上限。",
    SAVE_FILE_INVALID: "存档文件无效或是符号链接。",
    PARSER_INPUT_INVALID: "Parser 输入无效。",
    PARSER_OUTPUT_INVALID: "Parser 返回了无效输出。",
    PARSER_OUTPUT_TOO_LARGE: "Parser 输出超过安全大小上限。",
    PARSER_MANIFEST_INVALID: "内置 Parser 清单无效。",
    PARSER_BINARY_INVALID: "内置 Parser 可执行文件无效。",
    PARSER_BINARY_HASH_MISMATCH: "内置 Parser 未通过完整性校验。",
    UNKNOWN_ERROR: "发生错误，请稍后重试。",
  },
};
