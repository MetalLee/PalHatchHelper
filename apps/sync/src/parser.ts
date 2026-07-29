import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCanonicalSnapshot,
  type CanonicalSnapshot,
} from "@palhatch/contracts";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_BYTES = 32 * 1024;

interface ParserOptions {
  binary?: string;
  timeoutMilliseconds?: number;
}

export interface ParserManifest {
  schema_version: 1;
  binary_name: "palworld-save-parser";
  platform: "linux-x64";
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
  const snapshotInfo = await lstat(snapshotPath);
  if (!snapshotInfo.isDirectory() || snapshotInfo.isSymbolicLink())
    throw new Error("PARSER_INPUT_INVALID");
  const overriddenBinary = options.binary ?? process.env.PALBEACON_PARSER_BIN;
  const binary = overriddenBinary ?? bundledParserPath();
  if (overriddenBinary === undefined) await verifyBundledParser(binary);
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "palbeacon-sync-parser-"),
  );
  const outputPath = join(outputDirectory, "canonical.json");
  try {
    await executeParser(
      binary,
      snapshotPath,
      outputPath,
      options.timeoutMilliseconds ?? 180_000,
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
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

export async function bundledParserManifest(): Promise<ParserManifest> {
  const value: unknown = JSON.parse(
    await readFile(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "bin",
        "parser-manifest.json",
      ),
      "utf8",
    ),
  );
  if (typeof value !== "object" || value === null)
    throw new Error("PARSER_MANIFEST_INVALID");
  const manifest = value as Record<string, unknown>;
  if (
    manifest.schema_version !== 1 ||
    manifest.binary_name !== "palworld-save-parser" ||
    manifest.platform !== "linux-x64" ||
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

function bundledParserPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "bin",
    "palworld-save-parser",
  );
}

async function executeParser(
  binary: string,
  snapshotPath: string,
  outputPath: string,
  timeoutMilliseconds: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ["--snapshot", snapshotPath, "--output", outputPath],
      {
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: parserEnvironment(),
      },
    );
    let errorOutput = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (errorOutput.length < MAX_ERROR_BYTES)
        errorOutput += chunk.slice(0, MAX_ERROR_BYTES - errorOutput.length);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, timeoutMilliseconds);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("PARSER_TIMEOUT"));
      else if (code !== 0) reject(new Error(parserErrorCode(errorOutput)));
      else resolve();
    });
  });
}

async function verifyBundledParser(binary: string): Promise<void> {
  const binaryInfo = await lstat(binary);
  if (!binaryInfo.isFile() || binaryInfo.isSymbolicLink())
    throw new Error("PARSER_BINARY_INVALID");
  const manifest = await bundledParserManifest();
  const actual = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  if (actual !== manifest.sha256)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");
}

function parserEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ["PALHATCH_WORLD_UID", "PALHATCH_SAV_MAX_BYTES"]) {
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
