import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const version = (
  await readFile(join(repositoryRoot, "parser", "VERSION"), "utf8")
).trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("PARSER_VERSION_INVALID");

const { stdout } = await execFileAsync(
  join(repositoryRoot, "parser", "palworld-save-parser"),
  ["--version"],
  { encoding: "utf8" },
);
if (stdout.trim() !== version)
  throw new Error("PARSER_BINARY_VERSION_MISMATCH");

const expectedReferences = [
  ["infra/agent/.env.production.example", `PARSER_VERSION=${version}`],
  ["parser/README.md", `\`palworld-save-parser\` ${version}`],
  ["docs/operations/save-sync.md", `PARSER_VERSION=${version}`],
  [
    "docs/operations/production-deployment.md",
    `palhatch-plm-save-parser/${version}`,
  ],
  [`docs/releases/parser-${version}-release-candidate.md`, `Parser ${version}`],
];
for (const [relativePath, expected] of expectedReferences) {
  const contents = await readFile(join(repositoryRoot, relativePath), "utf8");
  if (!contents.includes(expected))
    throw new Error(`PARSER_VERSION_REFERENCE_MISMATCH:${relativePath}`);
}

process.stdout.write(`${version}\n`);
