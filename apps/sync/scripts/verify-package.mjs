import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { deflateSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const arguments_ = process.argv.slice(2);
const tarballArgument = arguments_.find((value) => !value.startsWith("--"));
if (tarballArgument === undefined)
  throw new Error(
    "usage: node scripts/verify-package.mjs <package.tgz> [--structure-only|--runtime-only]",
  );
const structureOnly = arguments_.includes("--structure-only");
const runtimeOnly = arguments_.includes("--runtime-only");
if (structureOnly && runtimeOnly) throw new Error("VERIFY_MODE_INVALID");

const tarball = resolve(tarballArgument);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDirectory, "..");
const repositoryRoot = join(packageRoot, "..", "..");
const fixtureRoot = join(
  repositoryRoot,
  "data",
  "parser-fixtures",
  "plm-minimal",
);
const temporaryRoot = await mkdtemp(join(tmpdir(), "palbeacon-package-"));
const result = {
  tarball,
  tarball_sha256: sha256(await readFile(tarball)),
};

try {
  let structure;
  if (!runtimeOnly) {
    structure = await verifyStructure();
    Object.assign(result, structure.report);
  }
  if (!structureOnly) {
    structure ??= await verifyStructure();
    Object.assign(result, await verifyRuntime(structure));
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function verifyStructure() {
  const { stdout: tarOutput } = await execFileAsync("tar", ["-tzf", tarball], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const files = tarOutput.split(/\r?\n/).filter(Boolean);
  const requiredFiles = [
    "package/LICENSE",
    "package/README.md",
    "package/README.zh-CN.md",
    "package/package.json",
    "package/dist/cli.js",
    "package/dist/bin/linux-x64/palworld-save-parser",
    "package/dist/bin/linux-x64/parser-manifest.json",
    "package/dist/bin/win32-x64/palworld-save-parser.exe",
    "package/dist/bin/win32-x64/parser-manifest.json",
    "package/dist/PARSER_SOURCE.md",
    "package/dist/THIRD_PARTY_NOTICES.md",
    "package/dist/LICENSES/GPL-3.0-or-later.txt",
    "package/dist/LICENSES/Apache-2.0.txt",
    "package/dist/LICENSES/MIT.txt",
    "package/dist/LICENSES/SIMDe-MIT.txt",
    "package/dist/LICENSES/CC0-1.0.txt",
    "package/dist/LICENSES/golang-x-text-BSD-3-Clause.txt",
  ];
  for (const required of requiredFiles) {
    if (!files.includes(required))
      throw new Error(`PACKAGE_FILE_MISSING:${required}`);
  }
  for (const entry of files) {
    const lower = entry.toLowerCase();
    if (
      lower.includes(["lib", "oo2core"].join("")) ||
      lower.includes("site-packages") ||
      lower.endsWith(".py") ||
      lower.endsWith(".pyc") ||
      lower.endsWith(".sav") ||
      lower.endsWith(".env") ||
      lower.endsWith(".dll") ||
      /\.(?:so|dylib)(?:\.|$)/.test(lower) ||
      /\.(?:c|cc|cpp|cxx|h|hpp|go|ts)$/.test(lower)
    ) {
      throw new Error(`PACKAGE_FORBIDDEN_FILE:${entry}`);
    }
  }

  const extractedRoot = join(temporaryRoot, "extracted");
  await mkdir(extractedRoot);
  await execFileAsync("tar", ["-xzf", tarball, "-C", extractedRoot]);
  const extractedPackage = join(extractedRoot, "package");
  const targets = [
    {
      platform: "linux-x64",
      binaryName: "palworld-save-parser",
    },
    {
      platform: "win32-x64",
      binaryName: "palworld-save-parser.exe",
    },
  ];
  const manifests = new Map();
  for (const target of targets) {
    const directory = join(extractedPackage, "dist", "bin", target.platform);
    const binary = join(directory, target.binaryName);
    const info = await lstat(binary);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("PARSER_BINARY_INVALID");
    if (target.platform === "linux-x64" && (info.mode & 0o111) === 0)
      throw new Error("PARSER_NOT_EXECUTABLE");
    const manifest = JSON.parse(
      await readFile(join(directory, "parser-manifest.json"), "utf8"),
    );
    validateManifest(manifest, target);
    if (manifest.sha256 !== sha256(await readFile(binary)))
      throw new Error("PARSER_BINARY_HASH_MISMATCH");
    manifests.set(target.platform, manifest);
  }
  assertSharedMetadata([...manifests.values()]);
  const windowsParser = join(
    extractedPackage,
    "dist",
    "bin",
    "win32-x64",
    "palworld-save-parser.exe",
  );
  const windowsImports = peImports(await readFile(windowsParser));
  for (const forbidden of [
    "libstdc++-6.dll",
    "libgcc_s_seh-1.dll",
    "libwinpthread-1.dll",
    "winhttp.dll",
    "wininet.dll",
  ]) {
    if (windowsImports.some((value) => value.toLowerCase() === forbidden))
      throw new Error(`WINDOWS_PARSER_DEPENDENCY_INVALID:${forbidden}`);
  }
  return {
    extractedPackage,
    manifests,
    files,
    report: {
      parser_version: manifests.get("linux-x64").version,
      parser_sha256: Object.fromEntries(
        [...manifests].map(([platform, manifest]) => [
          platform,
          manifest.sha256,
        ]),
      ),
      windows_pe_imports: windowsImports,
      files,
    },
  };
}

async function verifyRuntime(structure) {
  const runtimePlatform =
    process.platform === "linux" && process.arch === "x64"
      ? "linux-x64"
      : process.platform === "win32" && process.arch === "x64"
        ? "win32-x64"
        : undefined;
  if (runtimePlatform === undefined) throw new Error("PLATFORM_UNSUPPORTED");
  const manifest = structure.manifests.get(runtimePlatform);
  const binaryName = manifest.binary_name;
  const installRoot = join(temporaryRoot, "install with spaces");
  await mkdir(installRoot);
  await writeFile(
    join(installRoot, "package.json"),
    '{"name":"palbeacon-package-smoke","private":true}\n',
    "utf8",
  );
  await execFileAsync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: installRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const installedPackage = join(installRoot, "node_modules", "palbeacon-cli");
  const installedParser = join(
    installedPackage,
    "dist",
    "bin",
    runtimePlatform,
    binaryName,
  );
  const installedInfo = await lstat(installedParser);
  if (!installedInfo.isFile() || installedInfo.isSymbolicLink())
    throw new Error("INSTALLED_PARSER_INVALID");
  if (runtimePlatform === "linux-x64" && (installedInfo.mode & 0o111) === 0)
    throw new Error("INSTALLED_PARSER_NOT_EXECUTABLE");
  if (sha256(await readFile(installedParser)) !== manifest.sha256)
    throw new Error("INSTALLED_PARSER_HASH_MISMATCH");

  const installedCli = join(
    installRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "palbeacon.cmd" : "palbeacon",
  );
  const helpOutput = (await runCli(installedCli, ["--help"], installRoot))
    .stdout;
  if (
    !helpOutput.includes("palbeacon") ||
    !helpOutput.includes("Sync Palworld server saves to PalBeacon.") ||
    !helpOutput.includes("palbeacon init") ||
    !helpOutput.includes("palbeacon run") ||
    helpOutput.includes("inspect") ||
    helpOutput.includes("Parser")
  ) {
    throw new Error("INSTALLED_HELP_FAILED");
  }
  const chineseBefore = (
    await runCli(installedCli, ["--locale", "zh", "--help"], installRoot)
  ).stdout;
  const chineseAfter = (
    await runCli(installedCli, ["--help", "--locale", "zh-CN"], installRoot)
  ).stdout;
  if (
    !chineseBefore.includes("将 Palworld 服务器存档同步到 PalBeacon。") ||
    chineseBefore !== chineseAfter
  ) {
    throw new Error("INSTALLED_LOCALIZED_HELP_FAILED");
  }
  const cliVersion = (
    await runCli(installedCli, ["--version"], installRoot)
  ).stdout.trim();
  const packageMetadata = JSON.parse(
    await readFile(join(installedPackage, "package.json"), "utf8"),
  );
  if (cliVersion !== packageMetadata.version)
    throw new Error("INSTALLED_CLI_VERSION_MISMATCH");
  const parserVersion = (
    await execFileAsync(installedParser, ["--version"], { encoding: "utf8" })
  ).stdout.trim();
  if (parserVersion !== manifest.version)
    throw new Error("PARSER_VERSION_MISMATCH");

  let linkedLibraries;
  if (runtimePlatform === "linux-x64") {
    linkedLibraries = (
      await execFileAsync("ldd", [installedParser], { encoding: "utf8" })
    ).stdout;
    const linkedNames = [...linkedLibraries.matchAll(/^\s*(\S+)\s+=>/gm)].map(
      (match) => match[1],
    );
    if (
      /libstdc\+\+|libgcc_s|oo2core/i.test(linkedLibraries) ||
      linkedNames.length !== 1 ||
      linkedNames[0] !== "libc.so.6"
    ) {
      throw new Error("PARSER_DYNAMIC_DEPENDENCIES_INVALID");
    }
  }

  const plm = await verifyFixture(
    installedParser,
    join(fixtureRoot, "Level.sav"),
    "PlM/0x31",
    "plm",
  );
  const rawGvas = Buffer.from(
    (await readFile(join(fixtureRoot, "Level.gvas.base64"), "utf8")).replace(
      /\s/g,
      "",
    ),
    "base64",
  );
  const compressed = deflateSync(rawGvas);
  const plz = Buffer.alloc(12 + compressed.length);
  plz.writeUInt32LE(rawGvas.length, 0);
  plz.writeUInt32LE(compressed.length, 4);
  plz.write("PlZ", 8, "ascii");
  plz[11] = 0x31;
  compressed.copy(plz, 12);
  const plzInput = join(temporaryRoot, "generated-PlZ-Level.sav");
  await writeFile(plzInput, plz);
  await verifyFixture(installedParser, plzInput, "PlZ/0x31", "plz");

  const inspectCanonical = join(temporaryRoot, "inspect-canonical.json");
  const inspectPayload = join(temporaryRoot, "inspect-payload.json");
  await runCli(
    installedCli,
    [
      "inspect",
      "--save-dir",
      plm.snapshot,
      "--canonical-output",
      inspectCanonical,
      "--payload-output",
      inspectPayload,
    ],
    installRoot,
    { ...process.env, PALHATCH_WORLD_UID: "fixture-world-001" },
  );
  const inspectedCanonical = JSON.parse(
    await readFile(inspectCanonical, "utf8"),
  );
  const inspectedPayload = JSON.parse(await readFile(inspectPayload, "utf8"));
  if (!isDeepStrictEqual(inspectedCanonical, plm.expected))
    throw new Error("PACKAGED_INSPECT_CANONICAL_MISMATCH");
  if (
    inspectedPayload.server?.world_uid !==
      "pb1_02dc68a40c54afcc8f35ce23928f5e47069c4116177ffccdd29388bd1bffca36" ||
    inspectedPayload.parser_version !== manifest.version
  ) {
    throw new Error("PACKAGED_INSPECT_PAYLOAD_INVALID");
  }
  await assertUnmodified(plm);
  return {
    runtime_platform: runtimePlatform,
    cli_version: cliVersion,
    fixture_results: { PlM: "passed", PlZ: "passed", inspect: "passed" },
    cross_platform_hash_expected:
      "c7c68938565e0ac2c20f46a57e6d92dedf712528a0de04f331c89c4b6b9c3607",
    ...(linkedLibraries === undefined
      ? {}
      : { parser_ldd: linkedLibraries.trim().split(/\r?\n/) }),
  };
}

async function verifyFixture(parser, input, saveVersion, suffix) {
  const snapshot = join(temporaryRoot, `snapshot ${suffix} 幻兽帕鲁`);
  const players = join(snapshot, "Players");
  await mkdir(players, { recursive: true });
  const level = join(snapshot, "Level.sav");
  const player = join(players, "11111111111111111111111111111111.sav");
  await copyFile(input, level);
  await copyFile(input, player);
  if (process.platform !== "win32") {
    await chmod(level, 0o444);
    await chmod(player, 0o444);
  }
  const fixtureTime = new Date("2026-07-18T16:00:00.000Z");
  await utimes(level, fixtureTime, fixtureTime);
  await utimes(player, fixtureTime, fixtureTime);
  const levelHash = sha256(await readFile(level));
  const playerHash = sha256(await readFile(player));
  const output = join(temporaryRoot, `canonical-${suffix}.json`);
  await execFileAsync(parser, ["--snapshot", snapshot, "--output", output], {
    env: parserEnvironment(),
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  const actual = JSON.parse(await readFile(output, "utf8"));
  const expected = JSON.parse(
    await readFile(join(fixtureRoot, "expected-canonical.json"), "utf8"),
  );
  expected.server.save_version = saveVersion;
  if (!isDeepStrictEqual(actual, expected))
    throw new Error(`PACKAGED_PARSER_FIXTURE_MISMATCH:${suffix}`);
  const fixture = { snapshot, level, player, levelHash, playerHash, expected };
  await assertUnmodified(fixture);
  return fixture;
}

function parserEnvironment() {
  const environment = { PALHATCH_WORLD_UID: "fixture-world-001" };
  if (process.platform === "win32") {
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
  }
  return environment;
}

async function assertUnmodified(fixture) {
  if (
    sha256(await readFile(fixture.level)) !== fixture.levelHash ||
    sha256(await readFile(fixture.player)) !== fixture.playerHash
  ) {
    throw new Error("PACKAGED_PARSER_MODIFIED_INPUT");
  }
}

function validateManifest(manifest, target) {
  if (
    manifest.schema_version !== 1 ||
    manifest.binary_name !== target.binaryName ||
    manifest.platform !== target.platform ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
    manifest.license !== "GPL-3.0-or-later" ||
    manifest.source_repository !==
      "https://github.com/MetalLee/PalHatchHelper" ||
    !/^[0-9a-f]{40}$/.test(manifest.source_commit) ||
    manifest.source_subdirectory !== "parser" ||
    manifest.source_tree_clean !== true ||
    manifest.upstream_repository !==
      "https://github.com/deafdudecomputers/PalworldSaveTools" ||
    !/^[0-9a-f]{40}$/.test(manifest.upstream_commit)
  ) {
    throw new Error("PARSER_MANIFEST_INVALID");
  }
}

function assertSharedMetadata(values) {
  const [first, second] = values;
  for (const field of [
    "version",
    "source_repository",
    "source_commit",
    "source_subdirectory",
    "source_tree_clean",
    "upstream_repository",
    "upstream_commit",
    "license",
  ]) {
    if (first?.[field] !== second?.[field])
      throw new Error(`PARSER_METADATA_MISMATCH:${field}`);
  }
}

function peImports(value) {
  if (value.length < 0x40 || value.subarray(0, 2).toString("ascii") !== "MZ")
    throw new Error("WINDOWS_PARSER_PE_INVALID");
  const pe = value.readUInt32LE(0x3c);
  if (
    pe + 24 > value.length ||
    value.subarray(pe, pe + 4).toString("binary") !== "PE\0\0" ||
    value.readUInt16LE(pe + 4) !== 0x8664
  ) {
    throw new Error("WINDOWS_PARSER_PE_INVALID");
  }
  const sectionCount = value.readUInt16LE(pe + 6);
  const optionalSize = value.readUInt16LE(pe + 20);
  const optional = pe + 24;
  if (
    value.readUInt16LE(optional) !== 0x20b ||
    optional + optionalSize > value.length ||
    optionalSize < 128
  ) {
    throw new Error("WINDOWS_PARSER_PE_INVALID");
  }
  const importRva = value.readUInt32LE(optional + 120);
  if (importRva === 0) return [];
  const sections = [];
  const sectionTable = optional + optionalSize;
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionTable + index * 40;
    if (offset + 40 > value.length)
      throw new Error("WINDOWS_PARSER_PE_INVALID");
    sections.push({
      virtualSize: value.readUInt32LE(offset + 8),
      virtualAddress: value.readUInt32LE(offset + 12),
      rawSize: value.readUInt32LE(offset + 16),
      rawOffset: value.readUInt32LE(offset + 20),
    });
  }
  const fileOffset = (rva) => {
    const section = sections.find(
      (candidate) =>
        rva >= candidate.virtualAddress &&
        rva <
          candidate.virtualAddress +
            Math.max(candidate.virtualSize, candidate.rawSize),
    );
    if (section === undefined) throw new Error("WINDOWS_PARSER_PE_INVALID");
    return section.rawOffset + rva - section.virtualAddress;
  };
  const names = [];
  for (let descriptor = fileOffset(importRva); ; descriptor += 20) {
    if (descriptor + 20 > value.length)
      throw new Error("WINDOWS_PARSER_PE_INVALID");
    const words = Array.from({ length: 5 }, (_, index) =>
      value.readUInt32LE(descriptor + index * 4),
    );
    if (words.every((word) => word === 0)) break;
    const nameStart = fileOffset(words[3]);
    const nameEnd = value.indexOf(0, nameStart);
    if (nameEnd < 0) throw new Error("WINDOWS_PARSER_PE_INVALID");
    names.push(value.subarray(nameStart, nameEnd).toString("ascii"));
  }
  return names.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

async function runCli(executable, arguments__, cwd, environment = process.env) {
  return execFileAsync(executable, arguments__, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    ...(process.platform === "win32" ? { shell: true } : {}),
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
