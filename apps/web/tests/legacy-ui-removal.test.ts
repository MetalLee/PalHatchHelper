import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const legacyClassNames = [
  ["desktop", "sidebar"].join("-"),
  ["mobile", "bottom", "nav"].join("-"),
  ["side", "nav", "link"].join("-"),
  "admin-topbar",
  "admin-navigation",
  "primary-button",
  "secondary-button",
  "content-panel",
  "stat-card",
  "pal-card",
  "passive-chip",
  "route-tab",
  "login-card",
  "page-stack",
  "page-header",
  "detail-grid",
  "state-card",
  "admin-card",
  "admin-grid",
  "admin-kv",
  "admin-actions",
  "admin-form-grid",
  "admin-inline-form",
  "admin-action-stack",
  "admin-table-wrap",
  "admin-nav-scroll",
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("legacy UI removal", () => {
  it("keeps legacy display classes out of production components and globals", () => {
    const webRoot = process.cwd();
    const productionSource = ["app", "components", "features"]
      .flatMap((directory) => sourceFiles(join(webRoot, directory)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const globals = readFileSync(join(webRoot, "app/globals.css"), "utf8");

    for (const className of legacyClassNames) {
      expect(productionSource, className).not.toMatch(
        new RegExp(
          `className=(?:\"[^\"]*\\b${className}\\b|\\{[\`'\"][^\`'\"]*\\b${className}\\b)`,
        ),
      );
      expect(globals, className).not.toMatch(
        new RegExp(`\\.${className}(?:[^a-z0-9_-]|$)`, "i"),
      );
    }
  });

  it("does not use geometric Unicode glyphs as product navigation icons", () => {
    const webRoot = process.cwd();
    const productionSource = ["app", "components", "features"]
      .flatMap((directory) => sourceFiles(join(webRoot, directory)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(productionSource).not.toMatch(
      new RegExp("[\\u25eb\\u25c7\\u25b3\\u25a1]", "u"),
    );
  });
});
