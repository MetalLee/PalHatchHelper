import { access, lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  cleanup: vi.fn(async () => undefined),
  createSnapshot: vi.fn(),
  findWorldSave: vi.fn(async (value: string) => value),
  parseSnapshot: vi.fn(),
  parserManifest: vi.fn(async () => ({ version: "1.3.0" })),
}));

vi.mock("../src/snapshot.js", () => ({
  createReadOnlySnapshot: fakes.createSnapshot,
}));
vi.mock("../src/discovery.js", () => ({ findWorldSave: fakes.findWorldSave }));
vi.mock("../src/parser.js", () => ({
  parseSnapshot: fakes.parseSnapshot,
  bundledParserManifest: fakes.parserManifest,
}));

import { inspectSave } from "../src/inspect.js";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(removeTestDirectory));
});

const canonical = {
  server: {
    world_uid: "raw-world-uid",
    save_version: "PlM/0x31",
    captured_at: "2026-07-29T00:00:00.000Z",
  },
  guilds: [],
  players: [],
  pals: [],
};

describe("offline save inspection", () => {
  it("uses the upload pipeline without config, credentials, or network access", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-inspect-"));
    roots.push(root);
    const canonicalOutput = join(root, "canonical.json");
    const payloadOutput = join(root, "payload.json");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash: "a".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });
    fakes.parseSnapshot.mockResolvedValue(canonical);

    await inspectSave({
      saveDirectory: "/fixture/save",
      canonicalOutput,
      payloadOutput,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fakes.cleanup).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(canonicalOutput, "utf8"))).toEqual(
      canonical,
    );
    expect(JSON.parse(await readFile(payloadOutput, "utf8"))).toMatchObject({
      source_save_hash: "a".repeat(64),
      parser_version: "1.3.0",
      server: {
        world_uid:
          "pb1_a237c1853942de20b1e924d8db51bc916d8b0c837af5a36363934345a889ce9b",
      },
    });
    expect((await readFile(payloadOutput, "utf8")).split("\n")[1]).toMatch(
      /^ {2}"captured_at"/,
    );
    expect((await lstat(canonicalOutput)).mode & 0o777).toBe(0o600);
    expect((await lstat(payloadOutput)).mode & 0o777).toBe(0o600);
  });

  it("refuses existing outputs before reading the save", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-inspect-existing-"));
    roots.push(root);
    const canonicalOutput = join(root, "canonical.json");
    const payloadOutput = join(root, "payload.json");
    await writeFile(payloadOutput, "keep-me", "utf8");

    await expect(
      inspectSave({
        saveDirectory: "/fixture/save",
        canonicalOutput,
        payloadOutput,
      }),
    ).rejects.toThrowError(/INSPECT_OUTPUT_EXISTS/);
    expect(fakes.createSnapshot).not.toHaveBeenCalled();
    expect(await readFile(payloadOutput, "utf8")).toBe("keep-me");
  });

  it("always cleans the read-only snapshot when parsing fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-inspect-failure-"));
    roots.push(root);
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash: "b".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });
    fakes.parseSnapshot.mockRejectedValue(new Error("PARSER_FAILED"));

    await expect(
      inspectSave({
        saveDirectory: "/fixture/save",
        canonicalOutput: join(root, "canonical.json"),
        payloadOutput: join(root, "payload.json"),
      }),
    ).rejects.toThrowError(/PARSER_FAILED/);
    expect(fakes.cleanup).toHaveBeenCalledOnce();
  });

  it("removes a partial canonical output when the payload cannot be created", async () => {
    const root = await mkdtemp(join(tmpdir(), "palbeacon-inspect-atomic-"));
    roots.push(root);
    const canonicalOutput = join(root, "canonical.json");
    fakes.createSnapshot.mockResolvedValue({
      path: "/temporary/read-only-snapshot",
      hash: "c".repeat(64),
      sourceModifiedAt: "2026-07-29T00:00:00.000Z",
      cleanup: fakes.cleanup,
    });
    fakes.parseSnapshot.mockResolvedValue(canonical);

    await expect(
      inspectSave({
        saveDirectory: "/fixture/save",
        canonicalOutput,
        payloadOutput: join(root, "missing-parent", "payload.json"),
      }),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(canonicalOutput)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(fakes.cleanup).toHaveBeenCalledOnce();
  });
});
