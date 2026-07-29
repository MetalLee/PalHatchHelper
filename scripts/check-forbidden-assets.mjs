import { spawnSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const forbiddenExtensions = new Set([
  ".pak",
  ".ucas",
  ".utoc",
  ".uasset",
  ".uexp",
  ".ubulk",
  ".umap",
  ".usmap",
  ".sav",
]);
const allowedSyntheticSaveFixtures = new Set([
  "data/parser-fixtures/minimal-save/Players/0001.sav",
  "data/parser-fixtures/minimal-save/World.sav",
  "data/parser-fixtures/plm-minimal/Level.sav",
  "data/parser-fixtures/plm-minimal/Level.palooz-kraken.sav",
]);

const result = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
);
if (result.status !== 0) {
  throw new Error(
    "Unable to enumerate Git-tracked files for the asset safety check.",
  );
}

const forbidden = result.stdout
  .split("\0")
  .filter(Boolean)
  .filter(
    (path) =>
      forbiddenExtensions.has(extname(path).toLowerCase()) &&
      !allowedSyntheticSaveFixtures.has(path),
  )
  .sort();

if (forbidden.length > 0) {
  throw new Error(
    `Forbidden Palworld asset files are visible to Git:\n${forbidden.map((path) => `- ${path}`).join("\n")}`,
  );
}

console.log("Git-visible game asset safety check passed.");
