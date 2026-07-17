import {
  parseRuntimeSettings,
  type Database,
  type Json,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,160}$/;

type Body = Record<string, unknown>;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const supabase = await createServerSupabaseClient();
  const access = await supabase.rpc("is_admin");
  if (access.error !== null)
    return NextResponse.json(
      { ok: false, error_code: "ADMIN_DATA_UNAVAILABLE" },
      { status: 503, headers },
    );
  if (access.data !== true)
    return NextResponse.json(
      { ok: false, error_code: "ADMIN_ACCESS_DENIED" },
      { status: 403, headers },
    );

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return invalid(headers);
  }
  if (
    typeof body.action !== "string" ||
    typeof body.idempotency_key !== "string" ||
    !idempotencyPattern.test(body.idempotency_key)
  )
    return invalid(headers);

  try {
    const result = await execute(supabase, body);
    return NextResponse.json({ ok: true, data: result }, { headers });
  } catch (error) {
    const code = adminErrorCode(error);
    return NextResponse.json(
      {
        ok: false,
        error_code: code,
      },
      { status: code === "ADMIN_ACCESS_DENIED" ? 403 : 422, headers },
    );
  }
}

async function execute(
  supabase: SupabaseClient<Database>,
  body: Body,
): Promise<unknown> {
  const idempotency = String(body.idempotency_key);
  if (body.action === "binding_create") {
    const userId = uuid(body.user_id);
    const playerId = uuid(body.player_id);
    const { data, error } = await supabase.rpc("create_player_binding", {
      p_user_id: userId,
      p_player_id: playerId,
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "binding_update") {
    const { data, error } = await supabase.rpc("update_player_binding", {
      p_user_id: uuid(body.user_id),
      p_player_id: uuid(body.player_id),
      p_expected_version: integer(body.expected_version, 1, 2_147_483_647),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "binding_delete") {
    const { data, error } = await supabase.rpc("delete_player_binding", {
      p_user_id: uuid(body.user_id),
      p_expected_version: integer(body.expected_version, 1, 2_147_483_647),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "settings_update") {
    const settings = parseRuntimeSettings(body.settings);
    const { data, error } = await supabase.rpc("update_runtime_settings", {
      p_expected_version: integer(body.expected_version, 1, 2_147_483_647),
      p_settings: JSON.parse(JSON.stringify(settings)) as Json,
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "settings_rollback") {
    const { data, error } = await supabase.rpc("rollback_runtime_settings", {
      p_expected_version: integer(body.expected_version, 2, 2_147_483_647),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "catalog_upload_create") {
    const filename = catalogFilename(body.filename);
    const packageSha256 = sha256(body.package_sha256);
    const { data, error } = await supabase.rpc("create_admin_catalog_upload", {
      p_filename: filename,
      p_size_bytes: integer(body.size_bytes, 1, 64 * 1024 * 1024),
      p_package_sha256: packageSha256,
      p_source_id: uuid(body.source_id),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (body.action === "catalog_upload_ready") {
    const { data, error } = await supabase.rpc(
      "mark_admin_catalog_upload_ready",
      {
        p_upload_id: uuid(body.upload_id),
        p_idempotency_key: idempotency,
      },
    );
    if (error) throw error;
    return data;
  }
  if (body.action === "catalog_validate" || body.action === "catalog_stage") {
    const { data, error } = await supabase.rpc(
      "create_admin_catalog_operation",
      {
        p_operation_type:
          body.action === "catalog_validate" ? "validate" : "stage",
        p_upload_id: uuid(body.upload_id),
        p_idempotency_key: idempotency,
      },
    );
    if (error) throw error;
    return data;
  }
  if (body.action === "catalog_upload_reject") {
    const { data, error } = await supabase.rpc("reject_admin_catalog_upload", {
      p_upload_id: uuid(body.upload_id),
      p_confirmation: confirmation(body.confirmation),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  if (
    [
      "catalog_publish",
      "catalog_rollback",
      "catalog_inspect",
      "catalog_reject",
    ].includes(String(body.action))
  ) {
    const action = String(body.action).slice("catalog_".length);
    const { data, error } = await supabase.rpc("admin_catalog_version_action", {
      p_action: action,
      p_world_id:
        action === "publish" || action === "rollback"
          ? uuid(body.world_id)
          : null,
      p_version_id: uuid(body.version_id),
      p_confirmation:
        action === "inspect" ? null : confirmation(body.confirmation),
      p_idempotency_key: idempotency,
    });
    if (error) throw error;
    return data;
  }
  const commandType = commandForAction(body.action);
  if (commandType !== null) {
    const payload = commandPayload(body, commandType);
    const { data, error } = await supabase.rpc("create_agent_command", {
      p_command_type: commandType,
      p_payload: payload,
      p_idempotency_key: idempotency,
      p_ttl_seconds: 900,
    });
    if (error) throw error;
    return data;
  }
  throw new Error("ADMIN_ACTION_INVALID");
}

function commandForAction(action: unknown): string | null {
  const mapping: Record<string, string> = {
    sync_save_once: "sync_save_once",
    reparse_snapshot: "reparse_snapshot",
    approve_inventory_snapshot: "approve_inventory_snapshot",
    reject_inventory_snapshot: "reject_inventory_snapshot",
    cleanup_expired_agent_snapshots: "cleanup_expired_agent_snapshots",
    retry_breeding_job: "retry_breeding_job",
    cancel_breeding_job: "cancel_breeding_job",
    reap_stale_job_lock: "reap_stale_job_lock",
    template_ai_healthcheck: "template_ai_healthcheck",
    warm_catalog_cache: "warm_catalog_cache",
  };
  return typeof action === "string" ? (mapping[action] ?? null) : null;
}

function commandPayload(
  body: Body,
  commandType: string,
): Record<string, string | boolean> {
  if (
    [
      "retry_breeding_job",
      "cancel_breeding_job",
      "reap_stale_job_lock",
    ].includes(commandType)
  ) {
    return {
      job_id: uuid(body.job_id),
      ...(commandType === "reap_stale_job_lock"
        ? { confirmed_stale: body.confirmed_stale === true }
        : {}),
    };
  }
  if (
    [
      "reparse_snapshot",
      "approve_inventory_snapshot",
      "reject_inventory_snapshot",
    ].includes(commandType)
  )
    return { snapshot_id: uuid(body.snapshot_id) };
  if (commandType === "warm_catalog_cache")
    return { version_id: uuid(body.version_id) };
  return {};
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new Error("UUID_INVALID");
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error("INTEGER_INVALID");
  return value;
}

function catalogFilename(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.zst$/.test(value) ||
    /\.(pak|utoc|ucas|usmap|sav|dll|exe|png|jpe?g|gif|webp|mp3|wav|ogg)(\.|$)/i.test(
      value,
    )
  )
    throw new Error("CATALOG_UPLOAD_INVALID");
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new Error("CATALOG_UPLOAD_INVALID");
  return value;
}

function confirmation(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 100)
    throw new Error("CATALOG_CONFIRMATION_REQUIRED");
  return value;
}

const safeErrorCodes = new Set([
  "ADMIN_ACCESS_DENIED",
  "ADMIN_AUTH_REQUIRED",
  "ADMIN_CONTRACT_INVALID",
  "BINDING_CONFLICT",
  "BINDING_VERSION_CONFLICT",
  "BINDING_NOT_FOUND",
  "AGENT_COMMAND_NOT_ALLOWED",
  "AGENT_COMMAND_EXPIRED",
  "AGENT_COMMAND_CONFLICT",
  "CATALOG_UPLOAD_INVALID",
  "CATALOG_UPLOAD_CONFLICT",
  "CATALOG_UPLOAD_NOT_FOUND",
  "CATALOG_UPLOAD_INCOMPLETE",
  "CATALOG_UPLOAD_NOT_READY",
  "CATALOG_UPLOAD_NOT_VALIDATED",
  "CATALOG_ACTION_INVALID",
  "CATALOG_ACTION_CONFLICT",
  "CATALOG_CONFIRMATION_REQUIRED",
  "RUNTIME_SETTINGS_INVALID",
  "RUNTIME_SETTINGS_VERSION_CONFLICT",
  "RUNTIME_SETTINGS_NOT_FOUND",
]);

function adminErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null)
    return "ADMIN_DATA_UNAVAILABLE";
  const item = error as { code?: unknown; message?: unknown };
  if (item.code === "42501") return "ADMIN_ACCESS_DENIED";
  const message = typeof item.message === "string" ? item.message : "";
  return safeErrorCodes.has(message) ? message : "ADMIN_DATA_UNAVAILABLE";
}

function invalid(headers: Record<string, string>) {
  return NextResponse.json(
    { ok: false, error_code: "ADMIN_CONTRACT_INVALID" },
    { status: 400, headers },
  );
}
