#!/usr/bin/env node
import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseExactOptions } from "./json-tools.mjs";
import { assertCutoverReport } from "./public-sync-cutover.mjs";

export { assertCutoverReport } from "./public-sync-cutover.mjs";

const MAX_RESPONSE_BYTES = 1024 * 1024;

async function main() {
  const options = parseExactOptions(process.argv.slice(2), [
    "world-id",
    "expected-device-id",
    "expected-player-bindings",
    "expected-guild-count",
    "expected-player-count",
    "expected-pal-count",
  ]);
  const expected = {
    worldId: uuid(options["world-id"]),
    deviceId: uuid(options["expected-device-id"]),
    playerBindings: count(options["expected-player-bindings"]),
    guildCount: count(options["expected-guild-count"]),
    playerCount: count(options["expected-player-count"]),
    palCount: count(options["expected-pal-count"]),
  };
  const baseUrl = apiBaseUrl(process.env.SUPABASE_URL);
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole === undefined || serviceRole.length < 20)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
  const response = await fetch(
    new URL("/rest/v1/rpc/verify_public_sync_world_transition", baseUrl),
    {
      method: "POST",
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_world_id: expected.worldId }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES)
    throw new Error("CUTOVER_REPORT_TOO_LARGE");
  if (!response.ok)
    throw new Error(`CUTOVER_VERIFY_RPC_FAILED:HTTP_${response.status}`);
  const summary = assertCutoverReport(JSON.parse(body), expected);
  console.log(JSON.stringify(summary));
}

function uuid(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("UUID_INVALID");
  return value.toLowerCase();
}

function count(value) {
  if (!/^\d+$/.test(value)) throw new Error("COUNT_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("COUNT_INVALID");
  return parsed;
}

function apiBaseUrl(value) {
  if (value === undefined) throw new Error("SUPABASE_URL_REQUIRED");
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("SUPABASE_URL_INVALID");
  }
  return url;
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "CUTOVER_VERIFY_FAILED",
    );
    process.exitCode = 1;
  });
}
