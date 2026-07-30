import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { stageParserBinary } from "../scripts/parser-artifact.mjs";
import { removeTestDirectory } from "./support.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(removeTestDirectory)));

describe("release Parser artifact staging", () => {
  it.skipIf(process.platform === "win32")(
    "restores the packaged Linux execute bit without mutating the downloaded artifact",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "palbeacon-build-artifact-"));
      roots.push(root);
      const source = join(root, "downloaded-parser");
      const destination = join(root, "dist", "palworld-save-parser");
      const contents = Buffer.from("#!/bin/sh\nprintf '1.3.0\\n'\n");
      await writeFile(source, contents);
      await chmod(source, 0o644);

      await stageParserBinary({
        source,
        destination,
        platform: "linux-x64",
        sha256: createHash("sha256").update(contents).digest("hex"),
        version: "1.3.0",
      });

      expect((await lstat(source)).mode & 0o111).toBe(0);
      expect((await lstat(destination)).mode & 0o111).not.toBe(0);
    },
  );
});
