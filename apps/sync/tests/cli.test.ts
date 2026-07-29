import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  helpText,
  parseArguments,
  parseInspectArguments,
} from "../src/cli-options.js";
import {
  DEFAULT_API_BASE_URL,
  initialize,
  runContinuously,
  type InitRuntime,
  type RunRuntime,
} from "../src/cli.js";
import type { SyncConfig } from "../src/config.js";
import { DeviceAuthorizationError } from "../src/api.js";

const config: SyncConfig = {
  config_version: 2,
  api_base_url: DEFAULT_API_BASE_URL,
  device_id: "00000000-0000-4000-8000-000000000001",
  device_token: "pbs_fixture-secret",
  save_dir: "/fixture/world",
  interval_seconds: 300,
  device_name: "Fixture server",
};

describe("command-line interface", () => {
  it("does not advertise or accept the removed external decoder option", () => {
    const removedOption = ["--oo", "dle-lib"].join("");

    expect(helpText("0.1.0")).not.toContain(removedOption);
    expect(() => parseArguments([removedOption, "/legacy/runtime.so"])).toThrow(
      /ARGUMENTS_INVALID/,
    );
  });

  it("rejects the removed first-sync option and accepts advanced init overrides", () => {
    expect(() => parseArguments(["--sync-now", "yes"])).toThrowError(
      /ARGUMENTS_INVALID/,
    );
    expect(
      parseArguments([
        "--url",
        "http://127.0.0.1:3000",
        "--interval",
        "600",
        "--device-name",
        "Private server",
        "--force",
      ]),
    ).toEqual(
      new Map([
        ["url", "http://127.0.0.1:3000"],
        ["interval", "600"],
        ["device-name", "Private server"],
        ["force", "true"],
      ]),
    );
  });

  it("keeps inspect available without advertising it in the default help", () => {
    const help = helpText("0.1.0");
    expect(help).toContain("将 Palworld 服务器存档同步到 PalBeacon。");
    for (const command of ["init", "run", "status", "logout"])
      expect(help).toMatch(new RegExp(`^  ${command}\\s`, "m"));
    for (const hidden of [
      "inspect",
      "Parser",
      "sync --once",
      "--url",
      "--sync-now",
      "systemd",
      "Service Role",
    ])
      expect(help).not.toContain(hidden);
    expect(
      parseInspectArguments([
        "--save-dir",
        "/fixture/save",
        "--canonical-output",
        "/fixture/canonical.json",
        "--payload-output",
        "/fixture/payload.json",
      ]),
    ).toEqual({
      saveDirectory: "/fixture/save",
      canonicalOutput: "/fixture/canonical.json",
      payloadOutput: "/fixture/payload.json",
    });
    expect(() =>
      parseInspectArguments([
        "--save-dir",
        "/fixture/save",
        "--canonical-output",
        "/fixture/canonical.json",
      ]),
    ).toThrowError(/ARGUMENTS_INVALID/);
  });

  it("uses the public PalBeacon URL and asks only for code and save directory", async () => {
    const prompts: string[] = [];
    const output: string[] = [];
    const pairDevice = vi.fn(async () => ({
      api_base_url: DEFAULT_API_BASE_URL,
      device_id: config.device_id,
      device_token: config.device_token,
    }));
    const saveConfig = vi.fn(async () => "/hidden/config.json");
    const answers = ["ABCD-EFGH", "/opt/palworld/Pal/Saved/SaveGames"];
    const runtime = initRuntime({
      question: async (prompt) => {
        prompts.push(prompt);
        return answers.shift() ?? "";
      },
      pairDevice,
      saveConfig,
      log: (message) => output.push(message),
    });

    await initialize(new Map(), runtime);

    expect(prompts).toEqual([
      "请输入 PalBeacon 配对码：\n> ",
      "请输入 Palworld 存档目录：\n> ",
    ]);
    expect(prompts.join("\n")).not.toMatch(/地址|立即|同步？/);
    expect(pairDevice).toHaveBeenCalledWith(
      DEFAULT_API_BASE_URL,
      expect.objectContaining({
        code: "ABCD-EFGH",
        device_name: "Fixture server",
      }),
    );
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        api_base_url: DEFAULT_API_BASE_URL,
        interval_seconds: 300,
      }),
    );
    expect(output).toEqual([
      "✓ 已找到世界存档",
      "✓ 设备配对成功",
      "✓ 配置已保存",
      "",
      "现在运行：",
      "",
      "palbeacon-sync run",
      "",
      "即可开始定时同步。",
    ]);
  });

  it("honors URL, interval and device-name overrides", async () => {
    const pairDevice = vi.fn(async () => ({
      api_base_url: "http://127.0.0.1:3000",
      device_id: config.device_id,
      device_token: config.device_token,
    }));
    const saveConfig = vi.fn(async () => "/hidden/config.json");

    await initialize(
      parseArguments([
        "--url",
        "http://127.0.0.1:3000",
        "--code",
        "ABCD-EFGH",
        "--save-dir",
        "/fixture/world",
        "--interval",
        "900",
        "--device-name",
        "My Palworld",
      ]),
      initRuntime({ pairDevice, saveConfig, isInteractive: false }),
    );

    expect(pairDevice).toHaveBeenCalledWith(
      "http://127.0.0.1:3000",
      expect.objectContaining({ device_name: "My Palworld" }),
    );
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interval_seconds: 900,
        device_name: "My Palworld",
      }),
    );
  });

  it("never silently overwrites a valid configuration", async () => {
    const pairDevice = vi.fn();
    const saveConfig = vi.fn();
    const runtime = initRuntime({
      isInteractive: false,
      loadConfig: async () => config,
      pairDevice,
      saveConfig,
    });

    await expect(
      initialize(
        parseArguments(["--code", "ABCD-EFGH", "--save-dir", "/fixture/world"]),
        runtime,
      ),
    ).rejects.toThrowError(/CONFIG_ALREADY_EXISTS/);
    expect(pairDevice).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("requires interactive confirmation or --force before replacing pairing", async () => {
    const questions: string[] = [];
    const pairDevice = vi.fn(async () => ({
      api_base_url: DEFAULT_API_BASE_URL,
      device_id: config.device_id,
      device_token: config.device_token,
    }));
    const saveConfig = vi.fn(async () => "/hidden/config.json");
    const runtime = initRuntime({
      loadConfig: async () => config,
      question: async (prompt) => {
        questions.push(prompt);
        return "no";
      },
      pairDevice,
      saveConfig,
    });

    await initialize(new Map(), runtime);
    expect(questions[0]).toContain("本机已经完成配对");
    expect(questions[0]).toContain("替换当前设备配置");
    expect(pairDevice).not.toHaveBeenCalled();

    await initialize(
      parseArguments([
        "--force",
        "--code",
        "ABCD-EFGH",
        "--save-dir",
        "/fixture/world",
      ]),
      initRuntime({
        isInteractive: false,
        loadConfig: async () => config,
        pairDevice,
        saveConfig,
      }),
    );
    expect(pairDevice).toHaveBeenCalledOnce();
    expect(saveConfig).toHaveBeenCalledOnce();
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "syncs immediately, waits afterward and exits gracefully on %s",
    async (signal) => {
      const events: string[] = [];
      const handlers = new Map<string, () => void>();
      const runtime: RunRuntime = {
        loadConfig: async () => {
          events.push("load");
          return config;
        },
        syncOnce: async () => {
          events.push("sync");
          return "uploaded";
        },
        log: (message) => events.push(`log:${message}`),
        error: (message) => events.push(`error:${message}`),
        addSignalListener: (name, listener) => handlers.set(name, listener),
        removeSignalListener: (name) => {
          handlers.delete(name);
        },
        wait: async (milliseconds, stopped) => {
          events.push(`wait:${milliseconds}`);
          handlers.get(signal)?.();
          expect(stopped()).toBe(true);
        },
      };

      await runContinuously(runtime);

      expect(events.slice(0, 4)).toEqual([
        "load",
        "log:开始定时同步，每 300 秒检查一次。",
        "sync",
        "log:存档同步完成。",
      ]);
      expect(events).toContain("wait:300000");
      expect(events.at(-1)).toBe("log:同步已安全停止。");
      expect(handlers.size).toBe(0);
    },
  );

  it("continues after a transient failure but stops when device authorization is revoked", async () => {
    const errors: string[] = [];
    const sync = vi
      .fn<RunRuntime["syncOnce"]>()
      .mockRejectedValueOnce(new Error("PARSER_FAILED"))
      .mockRejectedValueOnce(new DeviceAuthorizationError());
    const runtime: RunRuntime = {
      loadConfig: async () => config,
      syncOnce: sync,
      log: vi.fn(),
      error: (message) => errors.push(message),
      addSignalListener: vi.fn(),
      removeSignalListener: vi.fn(),
      wait: async () => undefined,
    };

    await expect(runContinuously(runtime)).rejects.toBeInstanceOf(
      DeviceAuthorizationError,
    );
    expect(sync).toHaveBeenCalledTimes(2);
    expect(errors).toEqual(["本轮同步失败：发生错误，请稍后重试。"]);
    expect(runtime.removeSignalListener).toHaveBeenCalledTimes(2);
  });

  it("documents the install-first user flow without operational internals", async () => {
    const readme = await readFile(
      new URL("../README.md", import.meta.url),
      "utf8",
    );
    for (const expected of [
      "npm install -g palbeacon-sync",
      "palbeacon-sync init",
      "palbeacon-sync run",
    ])
      expect(readme).toContain(expected);
    for (const forbidden of [
      "systemd",
      "setfacl",
      "Oodle",
      "source_save_hash",
      "Service Role",
      "public_sync_world_transition",
      "palbeacon-sync inspect",
    ])
      expect(readme).not.toContain(forbidden);
  });
});

function initRuntime(overrides: Partial<InitRuntime> = {}): InitRuntime {
  return {
    isInteractive: true,
    assertSupportedPlatform: vi.fn(),
    question: async () => "",
    loadConfig: async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    findWorldSave: async () => "/fixture/world",
    pairDevice: async () => ({
      api_base_url: DEFAULT_API_BASE_URL,
      device_id: config.device_id,
      device_token: config.device_token,
    }),
    saveConfig: async () => "/hidden/config.json",
    hostname: () => "Fixture server",
    log: vi.fn(),
    ...overrides,
  };
}
