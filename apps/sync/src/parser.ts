import { createHash } from "node:crypto";
import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCanonicalSnapshot,
  type CanonicalSnapshot,
} from "@palhatch/contracts";

import { runtimePlatform, type RuntimePlatform } from "./platform.js";
import { normalizeWorldUid } from "./world-id.js";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_BYTES = 32 * 1024;

interface ParserOptions {
  binary?: string;
  binaryArguments?: string[];
  platform?: RuntimePlatform;
  timeoutMilliseconds?: number;
  worldUid?: string;
}

export interface ParserManifest {
  schema_version: 1;
  binary_name: "palworld-save-parser" | "palworld-save-parser.exe";
  platform: RuntimePlatform;
  version: string;
  sha256: string;
  license: "GPL-3.0-or-later";
  source_repository: string;
  source_commit: string;
  source_subdirectory: "parser";
  source_tree_clean: boolean;
  upstream_repository: string;
  upstream_commit: string;
}

export async function parseSnapshot(
  snapshotPath: string,
  options: ParserOptions = {},
): Promise<CanonicalSnapshot> {
  const platform = options.platform ?? runtimePlatform();
  const snapshotInfo = await lstat(snapshotPath);
  if (!snapshotInfo.isDirectory() || snapshotInfo.isSymbolicLink())
    throw new Error("PARSER_INPUT_INVALID");
  const overriddenBinary = options.binary ?? process.env.PALBEACON_PARSER_BIN;
  const binary =
    overriddenBinary ??
    join(bundledParserDirectory(platform), parserBinaryName(platform));
  if (overriddenBinary === undefined) {
    const manifest = await bundledParserManifest(platform);
    await verifyParserBinary(binary, manifest, platform);
  } else {
    await verifyParserFile(binary, platform);
  }
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "palbeacon-sync-parser-"),
  );
  const outputPath = join(outputDirectory, "canonical.json");
  try {
    await executeParser(
      binary,
      options.binaryArguments ?? [],
      snapshotPath,
      outputPath,
      options.timeoutMilliseconds ?? 180_000,
      platform,
      options.worldUid === undefined
        ? undefined
        : normalizeWorldUid(options.worldUid),
    );
    const outputInfo = await lstat(outputPath);
    if (!outputInfo.isFile() || outputInfo.isSymbolicLink())
      throw new Error("PARSER_OUTPUT_INVALID");
    if (outputInfo.size > MAX_OUTPUT_BYTES)
      throw new Error("PARSER_OUTPUT_TOO_LARGE");
    return parseCanonicalSnapshot(
      JSON.parse(await readFile(outputPath, "utf8")),
    );
  } finally {
    await rm(outputDirectory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

export async function bundledParserManifest(
  platform: RuntimePlatform = runtimePlatform(),
): Promise<ParserManifest> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(
        join(bundledParserDirectory(platform), "parser-manifest.json"),
        "utf8",
      ),
    );
  } catch {
    throw new Error("PARSER_MANIFEST_INVALID");
  }
  return validateParserManifest(value, platform);
}

export function validateParserManifest(
  value: unknown,
  platform: RuntimePlatform,
): ParserManifest {
  if (typeof value !== "object" || value === null)
    throw new Error("PARSER_MANIFEST_INVALID");
  const manifest = value as Record<string, unknown>;
  if (
    manifest.schema_version !== 1 ||
    manifest.binary_name !== parserBinaryName(platform) ||
    manifest.platform !== platform ||
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    typeof manifest.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
    manifest.license !== "GPL-3.0-or-later" ||
    typeof manifest.source_repository !== "string" ||
    !/^https:\/\/github\.com\//.test(manifest.source_repository) ||
    typeof manifest.source_commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(manifest.source_commit) ||
    manifest.source_subdirectory !== "parser" ||
    typeof manifest.source_tree_clean !== "boolean" ||
    typeof manifest.upstream_repository !== "string" ||
    !/^https:\/\/github\.com\//.test(manifest.upstream_repository) ||
    typeof manifest.upstream_commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(manifest.upstream_commit)
  ) {
    throw new Error("PARSER_MANIFEST_INVALID");
  }
  return manifest as unknown as ParserManifest;
}

export function bundledParserDirectory(platform: RuntimePlatform): string {
  return join(dirname(fileURLToPath(import.meta.url)), "bin", platform);
}

export function parserBinaryName(
  platform: RuntimePlatform,
): ParserManifest["binary_name"] {
  return platform === "win32-x64"
    ? "palworld-save-parser.exe"
    : "palworld-save-parser";
}

export function parserSpawnOptions(
  platform: RuntimePlatform,
  worldUid?: string,
): SpawnOptions {
  return {
    detached: platform === "linux-x64",
    windowsHide: platform === "win32-x64",
    stdio: ["ignore", "ignore", "pipe"],
    env: parserEnvironment(platform, worldUid),
  };
}

export function terminateParser(
  child: ChildProcess,
  platform: RuntimePlatform = runtimePlatform(),
): void {
  if (platform === "win32-x64") {
    child.kill();
    return;
  }
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function verifyParserBinary(
  binary: string,
  manifest: ParserManifest,
  platform: RuntimePlatform,
): Promise<void> {
  validateParserManifest(manifest, platform);
  if (basename(binary) !== manifest.binary_name)
    throw new Error("PARSER_BINARY_INVALID");
  await verifyParserFile(binary, platform);
  const actual = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  if (actual !== manifest.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");
}

async function executeParser(
  binary: string,
  binaryArguments: string[],
  snapshotPath: string,
  outputPath: string,
  timeoutMilliseconds: number,
  platform: RuntimePlatform,
  worldUid: string | undefined,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [...binaryArguments, "--snapshot", snapshotPath, "--output", outputPath],
      parserSpawnOptions(platform, worldUid),
    );
    let errorOutput = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (errorOutput.length < MAX_ERROR_BYTES)
        errorOutput += chunk.slice(0, MAX_ERROR_BYTES - errorOutput.length);
    });
    let timedOut = false;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve();
      else reject(error);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        terminateParser(child, platform);
      } catch {
        finish(new Error("PARSER_TIMEOUT"));
      }
    }, timeoutMilliseconds);
    child.once("error", (error) =>
      finish(timedOut ? new Error("PARSER_TIMEOUT") : error),
    );
    child.once("close", (code) => {
      if (timedOut) finish(new Error("PARSER_TIMEOUT"));
      else if (code !== 0) finish(new Error(parserErrorCode(errorOutput)));
      else finish();
    });
  });
}

async function verifyParserFile(
  binary: string,
  platform: RuntimePlatform,
): Promise<void> {
  const binaryInfo = await lstat(binary).catch(() => undefined);
  if (
    !binaryInfo?.isFile() ||
    binaryInfo.isSymbolicLink() ||
    (platform === "linux-x64" && (binaryInfo.mode & 0o111) === 0)
  ) {
    throw new Error("PARSER_BINARY_INVALID");
  }
}

function parserEnvironment(
  platform: RuntimePlatform,
  worldUid: string | undefined,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  if (worldUid !== undefined) environment.PALHATCH_WORLD_UID = worldUid;
  const keys = ["PALHATCH_SAV_MAX_BYTES"];
  if (platform === "win32-x64")
    keys.push("SystemRoot", "WINDIR", "TEMP", "TMP");
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function parserErrorCode(stderr: string): string {
  return (
    /PALHATCH_PARSER_ERROR code=([A-Z0-9_]+)/.exec(stderr)?.[1] ??
    "PARSER_FAILED"
  );
}
