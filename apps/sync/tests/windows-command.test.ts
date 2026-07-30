import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { windowsCommandInvocation } from "../scripts/windows-command.mjs";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Windows command shims", () => {
  it("quotes a shim path and arguments containing spaces", () => {
    expect(
      windowsCommandInvocation(
        String.raw`C:\install with spaces\palbeacon.cmd`,
        ["inspect", String.raw`C:\snapshot with spaces\Level.sav`],
        "cmd.exe",
      ),
    ).toEqual({
      executable: "cmd.exe",
      arguments: [
        "/d",
        "/s",
        "/c",
        String.raw`call "C:\install with spaces\palbeacon.cmd" "inspect" "C:\snapshot with spaces\Level.sav"`,
      ],
    });
  });

  it.skipIf(process.platform !== "win32")(
    "executes a cmd shim from a path containing spaces",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "palbeacon shim test "));
      temporaryDirectories.push(directory);
      const shim = join(directory, "palbeacon.cmd");
      await writeFile(shim, "@echo off\r\necho %~1\r\n", "utf8");
      const invocation = windowsCommandInvocation(shim, ["hello world"]);
      const result = await execFileAsync(
        invocation.executable,
        invocation.arguments,
        { encoding: "utf8", windowsHide: true },
      );
      expect(result.stdout.trim()).toBe("hello world");
    },
  );
});
