import type { CatalogFileChecksum } from "@palhatch/contracts";

const SET_ARRAY_FIELDS = new Set([
  "element_types",
  "locales",
  "errors",
  "warnings",
  "passive_skill_ids",
  "active_skill_ids",
]);

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function canonicalJsonLine(value: unknown): string {
  return `${canonicalStringify(value)}\n`;
}

export function* parseJsonLines(
  source: string,
): Generator<Record<string, unknown>> {
  if (source.length === 0) {
    return;
  }
  if (source.includes("\r") || !source.endsWith("\n")) {
    throw new Error("CATALOG_JSONL_LINE_ENDING_INVALID");
  }

  const lines = source.slice(0, -1).split("\n");
  for (const line of lines) {
    if (line.length === 0) {
      throw new Error("CATALOG_JSONL_BLANK_LINE");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error("CATALOG_JSON_INVALID");
    }
    if (!isRecord(parsed)) {
      throw new Error("CATALOG_JSON_OBJECT_REQUIRED");
    }
    if (canonicalStringify(parsed) !== line) {
      throw new Error("CATALOG_JSONL_NOT_CANONICAL");
    }
    yield parsed;
  }
}

export function buildContentHashInput(
  schemaVersion: string,
  files: readonly Pick<
    CatalogFileChecksum,
    "filename" | "sha256" | "record_count"
  >[],
): string {
  const sortedFiles = [...files]
    .map(({ filename, sha256, record_count }) => ({
      filename,
      record_count,
      sha256,
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));
  return canonicalStringify({
    files: sortedFiles,
    schema_version: schemaVersion,
  });
}

function normalizeValue(value: unknown, parentKey?: string): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("CATALOG_JSON_NUMBER_INVALID");
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeValue(item));
    if (!parentKey || !SET_ARRAY_FIELDS.has(parentKey)) {
      return normalized;
    }
    const unique = new Map(
      normalized.map((item) => [JSON.stringify(item), item]),
    );
    return [...unique.values()].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeValue(value[key], key)]),
    );
  }
  throw new Error("CATALOG_JSON_VALUE_UNSUPPORTED");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
