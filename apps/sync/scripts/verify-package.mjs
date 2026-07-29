import { createHash } from "node:crypto";
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

const execFileAsync = promisify(execFile);
const tarballArgument = process.argv[2];
if (tarballArgument === undefined)
  throw new Error("usage: node scripts/verify-package.mjs <package.tgz>");
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
const temporaryRoot = await mkdtemp(join(tmpdir(), "palbeacon-sync-package-"));

try {
  const { stdout: tarOutput } = await execFileAsync("tar", ["-tzf", tarball], {
    encoding: "utf8",
  });
  const files = tarOutput.split("\n").filter((entry) => entry.length > 0);
  const proprietaryLibraryStem = ["lib", "oo2core"].join("");
  const requiredFiles = [
    "package/LICENSE",
    "package/README.md",
    "package/package.json",
    "package/dist/cli.js",
    "package/dist/bin/palworld-save-parser",
    "package/dist/bin/parser-manifest.json",
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
      lower.includes(proprietaryLibraryStem) ||
      lower.includes("python") ||
      lower.includes("site-packages") ||
      lower.endsWith(".py") ||
      lower.endsWith(".pyc") ||
      lower.endsWith(".sav") ||
      /\.so(?:\.|$)/.test(lower) ||
      /\.(?:c|cc|cpp|cxx|h|hpp|go|ts)$/.test(lower)
    ) {
      throw new Error(`PACKAGE_FORBIDDEN_FILE:${entry}`);
    }
  }

  const extractedRoot = join(temporaryRoot, "extracted");
  await mkdir(extractedRoot);
  await execFileAsync("tar", ["-xzf", tarball, "-C", extractedRoot]);
  const extractedPackage = join(extractedRoot, "package");
  const parser = join(extractedPackage, "dist", "bin", "palworld-save-parser");
  const parserInfo = await lstat(parser);
  if (
    !parserInfo.isFile() ||
    parserInfo.isSymbolicLink() ||
    (parserInfo.mode & 0o111) === 0
  )
    throw new Error("PARSER_NOT_EXECUTABLE");
  const manifest = JSON.parse(
    await readFile(
      join(extractedPackage, "dist", "bin", "parser-manifest.json"),
      "utf8",
    ),
  );
  if (
    manifest.schema_version !== 1 ||
    manifest.binary_name !== "palworld-save-parser" ||
    manifest.platform !== "linux-x64" ||
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
  const parserHash = sha256(await readFile(parser));
  if (manifest.sha256 !== parserHash)
    throw new Error("PARSER_BINARY_HASH_MISMATCH");
  const { stdout: parserVersion } = await execFileAsync(parser, ["--version"], {
    encoding: "utf8",
  });
  if (parserVersion.trim() !== manifest.version)
    throw new Error("PARSER_VERSION_MISMATCH");
  const { stdout: linkedLibraries } = await execFileAsync("ldd", [parser], {
    encoding: "utf8",
  });
  const forbiddenDynamicLibrary = new RegExp(
    [proprietaryLibraryStem, "libstdc\\+\\+", "libgcc_s"].join("|"),
    "i",
  );
  const linkedNames = [...linkedLibraries.matchAll(/^\s*(\S+)\s+=>/gm)].map(
    (match) => match[1],
  );
  if (
    forbiddenDynamicLibrary.test(linkedLibraries) ||
    linkedNames.length !== 1 ||
    linkedNames[0] !== "libc.so.6"
  ) {
    throw new Error("PARSER_DYNAMIC_DEPENDENCIES_INVALID");
  }

  const installRoot = join(temporaryRoot, "install");
  await mkdir(installRoot);
  await writeFile(
    join(installRoot, "package.json"),
    '{"name":"palbeacon-package-smoke","private":true}\n',
    "utf8",
  );
  await execFileAsync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: installRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const installedPackage = join(installRoot, "node_modules", "palbeacon-sync");
  const installedParser = join(
    installedPackage,
    "dist",
    "bin",
    "palworld-save-parser",
  );
  const installedParserInfo = await lstat(installedParser);
  if (
    !installedParserInfo.isFile() ||
    installedParserInfo.isSymbolicLink() ||
    (installedParserInfo.mode & 0o111) === 0
  )
    throw new Error("INSTALLED_PARSER_NOT_EXECUTABLE");
  if (sha256(await readFile(installedParser)) !== manifest.sha256)
    throw new Error("INSTALLED_PARSER_HASH_MISMATCH");

  const installedCli = join(
    installRoot,
    "node_modules",
    ".bin",
    "palbeacon-sync",
  );
  const { stdout: helpOutput } = await execFileAsync(
    installedCli,
    ["--help"],
    { cwd: installRoot, encoding: "utf8" },
  );
  if (
    !helpOutput.includes("palbeacon-sync") ||
    !helpOutput.includes("palbeacon-sync init") ||
    !helpOutput.includes("palbeacon-sync run") ||
    helpOutput.includes("inspect") ||
    helpOutput.includes("Parser")
  )
    throw new Error("INSTALLED_HELP_FAILED");
  const { stdout: cliVersion } = await execFileAsync(
    installedCli,
    ["--version"],
    { cwd: installRoot, encoding: "utf8" },
  );
  const packageMetadata = JSON.parse(
    await readFile(join(installedPackage, "package.json"), "utf8"),
  );
  if (cliVersion.trim() !== packageMetadata.version)
    throw new Error("INSTALLED_CLI_VERSION_MISMATCH");

  const snapshot = join(temporaryRoot, "snapshot");
  const players = join(snapshot, "Players");
  await mkdir(players, { recursive: true });
  const level = join(snapshot, "Level.sav");
  const player = join(players, "11111111111111111111111111111111.sav");
  await copyFile(join(fixtureRoot, "Level.sav"), level);
  await copyFile(join(fixtureRoot, "Level.sav"), player);
  await chmod(level, 0o444);
  await chmod(player, 0o444);
  const fixtureTime = new Date("2026-07-18T16:00:00.000Z");
  await utimes(level, fixtureTime, fixtureTime);
  await utimes(player, fixtureTime, fixtureTime);
  const levelHash = sha256(await readFile(level));
  const playerHash = sha256(await readFile(player));
  const output = join(temporaryRoot, "canonical.json");
  await execFileAsync(
    installedParser,
    ["--snapshot", snapshot, "--output", output],
    {
      env: { PALHATCH_WORLD_UID: "fixture-world-001" },
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  const actualCanonical = JSON.parse(await readFile(output, "utf8"));
  const expectedCanonical = JSON.parse(
    await readFile(join(fixtureRoot, "expected-canonical.json"), "utf8"),
  );
  if (JSON.stringify(actualCanonical) !== JSON.stringify(expectedCanonical))
    throw new Error("PACKAGED_PARSER_FIXTURE_MISMATCH");
  if (
    sha256(await readFile(level)) !== levelHash ||
    sha256(await readFile(player)) !== playerHash
  ) {
    throw new Error("PACKAGED_PARSER_MODIFIED_INPUT");
  }

  const inspectCanonical = join(temporaryRoot, "inspect-canonical.json");
  const inspectPayload = join(temporaryRoot, "inspect-payload.json");
  await execFileAsync(
    "npx",
    [
      "--no-install",
      "palbeacon-sync",
      "inspect",
      "--save-dir",
      snapshot,
      "--canonical-output",
      inspectCanonical,
      "--payload-output",
      inspectPayload,
    ],
    {
      cwd: installRoot,
      encoding: "utf8",
      env: { ...process.env, PALHATCH_WORLD_UID: "fixture-world-001" },
      timeout: 30_000,
    },
  );
  const inspectedCanonical = JSON.parse(
    await readFile(inspectCanonical, "utf8"),
  );
  const inspectedPayload = JSON.parse(await readFile(inspectPayload, "utf8"));
  if (!isDeepStrictEqual(inspectedCanonical, expectedCanonical))
    throw new Error("PACKAGED_INSPECT_CANONICAL_MISMATCH");
  if (
    inspectedPayload.server?.world_uid !==
      "pb1_02dc68a40c54afcc8f35ce23928f5e47069c4116177ffccdd29388bd1bffca36" ||
    inspectedPayload.parser_version !== manifest.version
  ) {
    throw new Error("PACKAGED_INSPECT_PAYLOAD_INVALID");
  }
  if (
    sha256(await readFile(level)) !== levelHash ||
    sha256(await readFile(player)) !== playerHash
  ) {
    throw new Error("PACKAGED_INSPECT_MODIFIED_INPUT");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        tarball,
        tarball_sha256: sha256(await readFile(tarball)),
        parser_version: manifest.version,
        parser_sha256: manifest.sha256,
        parser_ldd: linkedLibraries.trim().split("\n"),
        files,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
