import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const LEGACY_RUNTIME_PATH_FIELD = ["oodle", "lib"].join("_");
const LEGACY_RUNTIME_HASH_FIELD = ["oodle", "sha256"].join("_");

export interface SyncConfig {
  config_version: 2;
  api_base_url: string;
  device_id: string;
  device_token: string;
  save_dir: string;
  interval_seconds: number;
  device_name: string;
  app_version?: string;
  state?: {
    last_save_hash?: string;
    last_result?: string;
    last_sync_at?: string;
  };
}

export function configDirectory(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(
    xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"),
    "palbeacon-sync",
  );
}

export function configPath(directory = configDirectory()): string {
  return join(directory, "config.json");
}

export async function saveConfig(
  config: SyncConfig,
  directory = configDirectory(),
): Promise<string> {
  const path = configPath(directory);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
  return path;
}

export async function loadConfig(
  directory = configDirectory(),
): Promise<SyncConfig> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(configPath(directory), "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("SYNC_CONFIG_INVALID");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    )
      throw new Error("SYNC_CONFIG_NOT_FOUND");
    throw error;
  }
  const config = normalizeSyncConfig(value);
  if (config === undefined) throw new Error("SYNC_CONFIG_INVALID");
  const record = value as Record<string, unknown>;
  if (
    record.config_version !== 2 ||
    LEGACY_RUNTIME_PATH_FIELD in record ||
    LEGACY_RUNTIME_HASH_FIELD in record
  ) {
    await saveConfig(config, directory);
  }
  return config;
}

export async function deleteConfig(
  directory = configDirectory(),
): Promise<void> {
  await rm(configPath(directory), { force: true });
}

export function formatStatus(config: SyncConfig): string {
  return [
    `服务器：${config.api_base_url}`,
    `设备：${config.device_name} (${config.device_id})`,
    `存档：${config.save_dir}`,
    `间隔：${config.interval_seconds} 秒`,
    `最近结果：${config.state?.last_result ?? "尚未同步"}`,
    `最近时间：${config.state?.last_sync_at ?? "尚未同步"}`,
  ].join("\n");
}

function normalizeSyncConfig(value: unknown): SyncConfig | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const config = value as Record<string, unknown>;
  if (
    (config.config_version !== undefined &&
      config.config_version !== 1 &&
      config.config_version !== 2) ||
    typeof config.api_base_url !== "string" ||
    typeof config.device_id !== "string" ||
    typeof config.device_token !== "string" ||
    typeof config.save_dir !== "string" ||
    typeof config.interval_seconds !== "number" ||
    !Number.isInteger(config.interval_seconds) ||
    config.interval_seconds < 30 ||
    typeof config.device_name !== "string"
  ) {
    return undefined;
  }
  const appVersion =
    typeof config.app_version === "string" ? config.app_version : undefined;
  const state = normalizeState(config.state);
  if (config.state !== undefined && state === undefined) return undefined;
  return {
    config_version: 2,
    api_base_url: config.api_base_url,
    device_id: config.device_id,
    device_token: config.device_token,
    save_dir: config.save_dir,
    interval_seconds: config.interval_seconds,
    device_name: config.device_name,
    ...(appVersion === undefined ? {} : { app_version: appVersion }),
    ...(state === undefined ? {} : { state }),
  };
}

function normalizeState(value: unknown): SyncConfig["state"] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return undefined;
  const state = value as Record<string, unknown>;
  for (const key of ["last_save_hash", "last_result", "last_sync_at"]) {
    if (state[key] !== undefined && typeof state[key] !== "string")
      return undefined;
  }
  return {
    ...(typeof state.last_save_hash === "string"
      ? { last_save_hash: state.last_save_hash }
      : {}),
    ...(typeof state.last_result === "string"
      ? { last_result: state.last_result }
      : {}),
    ...(typeof state.last_sync_at === "string"
      ? { last_sync_at: state.last_sync_at }
      : {}),
  };
}
