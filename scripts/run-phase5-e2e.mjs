import { spawnSync } from "node:child_process";

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    if (options.stdio !== "inherit") {
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${argumentsList.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function localSupabaseEnvironment(source) {
  const values = new Map();
  for (const line of source.split("\n")) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2]);
    }
  }
  const url = values.get("API_URL");
  const anonKey = values.get("ANON_KEY");
  if (url !== "http://127.0.0.1:54321" || anonKey === undefined) {
    throw new Error("Phase 5 E2E requires the repository-local Supabase stack");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  };
}

run("supabase", ["start"]);
run("supabase", ["db", "reset"], { stdio: "inherit" });
const localEnvironment = localSupabaseEnvironment(
  run("supabase", ["status", "-o", "env"]),
);

let testFailure;
try {
  run("pnpm", ["--filter", "@palhatch/web", "exec", "playwright", "test"], {
    env: { ...process.env, ...localEnvironment },
    stdio: "inherit",
  });
} catch (error) {
  testFailure = error;
} finally {
  run("supabase", ["db", "reset"], { stdio: "inherit" });
}

if (testFailure !== undefined) throw testFailure;
