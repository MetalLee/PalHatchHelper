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

export interface SyncConfig {
  api_base_url: string;
  device_id: string;
  device_token: string;
  save_dir: string;
  oodle_lib: string;
  oodle_sha256: string;
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
  const value: unknown = JSON.parse(
    await readFile(configPath(directory), "utf8"),
  );
  if (!isSyncConfig(value)) throw new Error("SYNC_CONFIG_INVALID");
  return value;
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

function isSyncConfig(value: unknown): value is SyncConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.api_base_url === "string" &&
    typeof config.device_id === "string" &&
    typeof config.device_token === "string" &&
    typeof config.save_dir === "string" &&
    typeof config.oodle_lib === "string" &&
    typeof config.oodle_sha256 === "string" &&
    typeof config.interval_seconds === "number" &&
    Number.isInteger(config.interval_seconds) &&
    config.interval_seconds >= 30 &&
    typeof config.device_name === "string"
  );
}
