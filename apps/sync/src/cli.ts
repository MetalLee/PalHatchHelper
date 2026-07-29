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
import {
  extractLocaleOption,
  messages,
  resolveLocale,
  type CliLocale,
} from "./locale.js";
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

if (isDirectExecution()) runDirectly();

function runDirectly(): void {
  let locale: CliLocale = "en";
  let arguments_: string[];
  try {
    const extracted = extractLocaleOption(process.argv.slice(2));
    arguments_ = extracted.arguments;
    locale = resolveLocale(extracted.requestedLocale);
  } catch (error) {
    handleFatalError(error, locale);
    return;
  }
  void main(arguments_, locale).catch((error: unknown) =>
    handleFatalError(error, locale),
  );
}

function handleFatalError(error: unknown, locale: CliLocale): void {
  const text = messages(locale);
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (error instanceof DeviceAuthorizationError) {
    console.error(text.authorizationRevoked);
  } else {
    console.error(
      `${text.fatalPrefix}${friendlyError(error, message, locale)}`,
    );
  }
  process.exitCode = 1;
}

async function main(arguments_: string[], locale: CliLocale): Promise<void> {
  const [command, ...commandArguments] = arguments_;
  if (command === undefined || command === "--help" || command === "-h") {
    printHelp(locale);
    return;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }
  if (command === "init") {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      await initialize(
        parseArguments(commandArguments),
        {
          isInteractive: stdin.isTTY,
          assertSupportedPlatform: () =>
            assertSupportedPlatform(undefined, undefined, locale),
          question: (prompt) => terminal.question(prompt),
          loadConfig,
          findWorldSave,
          pairDevice,
          saveConfig,
          hostname,
          log: console.log,
        },
        locale,
      );
    } finally {
      terminal.close();
    }
  } else if (command === "run") {
    if (commandArguments.length > 0) throw new Error("ARGUMENTS_INVALID");
    assertSupportedPlatform(undefined, undefined, locale);
    await runContinuously(defaultRunRuntime(), locale);
  } else if (command === "sync") {
    if (commandArguments.length !== 1 || commandArguments[0] !== "--once")
      throw new Error("SYNC_ONCE_REQUIRED");
    await runSingleSync(locale);
  } else if (command === "inspect") {
    assertSupportedPlatform(undefined, undefined, locale);
    const outputs = parseInspectArguments(commandArguments);
    await inspectSave(outputs);
    console.log(messages(locale).inspectComplete(outputs.canonicalOutput));
    console.log(messages(locale).inspectPayload(outputs.payloadOutput));
  } else if (command === "status") {
    if (commandArguments.length > 0) throw new Error("ARGUMENTS_INVALID");
    console.log(formatStatus(await loadConfig(), locale));
  } else if (command === "logout") {
    if (commandArguments.length > 0) throw new Error("ARGUMENTS_INVALID");
    await deleteConfig();
    console.log(messages(locale).loggedOut);
  } else throw new Error("COMMAND_UNKNOWN");
}

export async function initialize(
  options: Map<string, string>,
  runtime: InitRuntime,
  locale: CliLocale = "en",
): Promise<void> {
  const text = messages(locale);
  runtime.assertSupportedPlatform();
  const hasExistingConfig =
    options.get("force") === "true"
      ? false
      : await existingConfig(runtime.loadConfig);
  if (hasExistingConfig && options.get("force") !== "true") {
    if (!runtime.isInteractive) throw new Error("CONFIG_ALREADY_EXISTS");
    const replace = parseConfirmation(
      await runtime.question(text.replacePrompt),
    );
    if (!replace) {
      runtime.log(text.cancelled);
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
    options.get("code") ?? (await runtime.question(text.pairingCodePrompt))
  )
    .trim()
    .toUpperCase();
  const providedSaveDirectory =
    options.get("save-dir") ??
    (await runtime.question(text.saveDirectoryPrompt));
  const saveDirectory = await runtime.findWorldSave(
    providedSaveDirectory.trim(),
  );
  runtime.log(text.saveFound);
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
  runtime.log(text.paired);
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
  runtime.log(text.configSaved);
  for (const line of text.runNext) runtime.log(line);
}

async function runSingleSync(locale: CliLocale): Promise<void> {
  assertSupportedPlatform(undefined, undefined, locale);
  const result = await syncOnce(await loadConfig());
  console.log(syncResultMessage(result, locale));
}

export async function runContinuously(
  runtime: RunRuntime,
  locale: CliLocale = "en",
): Promise<void> {
  const text = messages(locale);
  const config = await runtime.loadConfig();
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  runtime.addSignalListener("SIGINT", stop);
  runtime.addSignalListener("SIGTERM", stop);
  runtime.log(text.runStarted(config.interval_seconds));
  try {
    while (!stopping) {
      try {
        const result = await runtime.syncOnce(config);
        runtime.log(syncResultMessage(result, locale));
      } catch (error) {
        if (error instanceof DeviceAuthorizationError) throw error;
        runtime.error(
          text.syncFailed(
            friendlyError(
              error,
              error instanceof Error ? error.message : "UNKNOWN_ERROR",
              locale,
            ),
          ),
        );
      }
      if (!stopping)
        await runtime.wait(config.interval_seconds * 1000, () => stopping);
    }
  } finally {
    runtime.removeSignalListener("SIGINT", stop);
    runtime.removeSignalListener("SIGTERM", stop);
    runtime.log(text.stopped);
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

function syncResultMessage(
  result: "uploaded" | "unchanged",
  locale: CliLocale,
): string {
  const text = messages(locale);
  return result === "uploaded" ? text.uploaded : text.unchanged;
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

function friendlyError(
  error: unknown,
  code: string,
  locale: CliLocale,
): string {
  const text = messages(locale);
  if (isMissingFileError(error))
    return (
      text.errors.SYNC_CONFIG_NOT_FOUND ?? text.errors.UNKNOWN_ERROR ?? code
    );
  return text.errors[code] ?? text.errors.UNKNOWN_ERROR ?? code;
}

function printHelp(locale: CliLocale): void {
  console.log(helpText(VERSION, locale));
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
