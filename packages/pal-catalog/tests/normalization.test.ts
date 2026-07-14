import { describe, expect, it } from "vitest";

import {
  buildContentHashInput,
  canonicalJsonLine,
  fixtureCatalog,
  parseJsonLines,
} from "../src";

describe("catalog normalization", () => {
  it("writes stable keys, set-like arrays, LF, and a final newline", () => {
    expect(
      canonicalJsonLine({
        pal_id: "fixture-pal-a",
        element_types: ["water", "fire", "fire"],
        metadata: { z: true, a: false },
      }),
    ).toBe(
      '{"element_types":["fire","water"],"metadata":{"a":false,"z":true},"pal_id":"fixture-pal-a"}\n',
    );
  });

  it("streams canonical JSONL and rejects non-canonical or malformed input", () => {
    const source = '{"pal_id":"fixture-pal-a"}\n{"pal_id":"fixture-pal-b"}\n';
    expect([...parseJsonLines(source)]).toHaveLength(2);
    expect(() => [...parseJsonLines('{"z":1,"a":2}\n')]).toThrow(
      "CATALOG_JSONL_NOT_CANONICAL",
    );
    expect(() => [...parseJsonLines("{broken}\n")]).toThrow(
      "CATALOG_JSON_INVALID",
    );
  });

  it("builds content hash input independent of file order and timestamps", () => {
    const first = buildContentHashInput("1.0.0", [
      { filename: "pals.jsonl", sha256: "a".repeat(64), record_count: 2 },
      {
        filename: "active-skills.jsonl",
        sha256: "b".repeat(64),
        record_count: 1,
      },
    ]);
    const second = buildContentHashInput("1.0.0", [
      {
        filename: "active-skills.jsonl",
        sha256: "b".repeat(64),
        record_count: 1,
      },
      { filename: "pals.jsonl", sha256: "a".repeat(64), record_count: 2 },
    ]);

    expect(first).toBe(second);
    expect(first).not.toContain("created_at");
  });

  it("keeps only a clearly fictional fixture", () => {
    expect(fixtureCatalog.schema_version).toBe("1.0.0");
    expect(
      fixtureCatalog.pals.every((pal) => pal.pal_id.startsWith("fixture-")),
    ).toBe(true);
  });
});
