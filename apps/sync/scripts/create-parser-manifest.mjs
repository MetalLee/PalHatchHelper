import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import process from "node:process";

const execFileAsync = promisify(execFile);
const [platform, binaryArgument, outputArgument] = process.argv.slice(2);
if (
  (platform !== "linux-x64" && platform !== "win32-x64") ||
  binaryArgument === undefined ||
  outputArgument === undefined
) {
  throw new Error(
    "usage: node create-parser-manifest.mjs <linux-x64|win32-x64> <binary> <output>",
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const parserRoot = resolve(repositoryRoot, "parser");
const binary = resolve(binaryArgument);
const output = resolve(outputArgument);
const binaryName =
  platform === "win32-x64"
    ? "palworld-save-parser.exe"
    : "palworld-save-parser";
const info = await lstat(binary);
if (!info.isFile() || info.isSymbolicLink())
  throw new Error("PARSER_BINARY_INVALID");
if (platform === "linux-x64") await chmod(binary, 0o755);

const bytes = await readFile(binary);
assertExecutableFormat(bytes, platform);
const version = (await readFile(resolve(parserRoot, "VERSION"), "utf8"))
  .trim()
  .replace(/\r/g, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("PARSER_VERSION_INVALID");
if (platform === "linux-x64") {
  const { stdout } = await execFileAsync(binary, ["--version"], {
    encoding: "utf8",
  });
  if (stdout.trim() !== version) throw new Error("PARSER_VERSION_MISMATCH");
}

const sourceCommit = (
  await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
).stdout.trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit))
  throw new Error("PARSER_SOURCE_COMMIT_INVALID");
const parserStatus = (
  await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", "parser"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
).stdout;
if (parserStatus.split("\n").some(Boolean))
  throw new Error("PARSER_SOURCE_TREE_DIRTY");

const upstreamNotice = await readFile(
  resolve(parserRoot, "third_party", "palooz", "UPSTREAM.md"),
  "utf8",
);
const upstreamCommit = /Pinned commit: `([0-9a-f]{40})`/.exec(
  upstreamNotice,
)?.[1];
if (upstreamCommit === undefined)
  throw new Error("PALOOZ_UPSTREAM_COMMIT_INVALID");

const manifest = {
  schema_version: 1,
  binary_name: binaryName,
  platform,
  version,
  sha256: sha256(bytes),
  license: "GPL-3.0-or-later",
  source_repository: "https://github.com/MetalLee/PalHatchHelper",
  source_commit: sourceCommit,
  source_subdirectory: "parser",
  source_tree_clean: true,
  upstream_repository: "https://github.com/deafdudecomputers/PalworldSaveTools",
  upstream_commit: upstreamCommit,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest)}\n`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExecutableFormat(value, targetPlatform) {
  if (targetPlatform === "linux-x64") {
    if (
      value.length < 20 ||
      !value.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      value[4] !== 2 ||
      value.readUInt16LE(18) !== 0x3e
    ) {
      throw new Error("PARSER_EXECUTABLE_FORMAT_INVALID");
    }
    return;
  }
  if (value.length < 0x40 || value.subarray(0, 2).toString("ascii") !== "MZ")
    throw new Error("PARSER_EXECUTABLE_FORMAT_INVALID");
  const peOffset = value.readUInt32LE(0x3c);
  if (
    peOffset + 6 > value.length ||
    value.subarray(peOffset, peOffset + 4).toString("binary") !== "PE\0\0" ||
    value.readUInt16LE(peOffset + 4) !== 0x8664
  ) {
    throw new Error("PARSER_EXECUTABLE_FORMAT_INVALID");
  }
}
