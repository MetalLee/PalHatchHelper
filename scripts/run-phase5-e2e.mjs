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
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  if (
    url !== "http://127.0.0.1:54321" ||
    anonKey === undefined ||
    serviceRoleKey === undefined
  ) {
    throw new Error("Phase 5 E2E requires the repository-local Supabase stack");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    PALHATCH_E2E_SUPABASE_URL: url,
    PALHATCH_E2E_SERVICE_ROLE_KEY: serviceRoleKey,
    PALHATCH_E2E_AGENT_DATA_DIR: `/tmp/palhatch-phase6-e2e-${process.pid}`,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
  };
}

function refreshLocalGateway() {
  run("docker", ["restart", "supabase_kong_pal-hatch-helper-local"], {
    stdio: "inherit",
  });
}

function pauseOptionalLocalServices() {
  run(
    "docker",
    [
      "stop",
      "supabase_studio_pal-hatch-helper-local",
      "supabase_analytics_pal-hatch-helper-local",
      "supabase_realtime_pal-hatch-helper-local",
      "supabase_inbucket_pal-hatch-helper-local",
      "supabase_pg_meta_pal-hatch-helper-local",
    ],
    { stdio: "inherit" },
  );
}

run("supabase", ["start"]);
run("supabase", ["db", "reset"], { stdio: "inherit" });
refreshLocalGateway();
pauseOptionalLocalServices();
const localEnvironment = localSupabaseEnvironment(
  run("supabase", ["status", "-o", "env"]),
);

run("pnpm", ["--filter", "@palhatch/web", "exec", "playwright", "test"], {
  env: { ...process.env, ...localEnvironment },
  stdio: "inherit",
});
