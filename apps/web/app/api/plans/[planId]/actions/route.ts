import { NextResponse, type NextRequest } from "next/server";

import { authUserErrorCode } from "@/features/phase5-errors";
import { planHttpStatus, safePlanErrorCode } from "@/features/plans/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

type ActionBody = {
  action?: string;
  step_id?: string;
  candidate_key?: string;
  pal_instance_uid?: string;
  allow_passive_mismatch?: boolean;
  reason?: string;
  expected_concurrency_version?: number;
  idempotency_key?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const authCode = authUserErrorCode(auth.user, authError);
  if (authCode !== null)
    return NextResponse.json(
      { error_code: authCode },
      { status: planHttpStatus(authCode), headers: privateHeaders },
    );
  const { planId } = await params;
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    body = {};
  }
  if (
    !Number.isInteger(body.expected_concurrency_version) ||
    (body.expected_concurrency_version ?? 0) < 1 ||
    typeof body.idempotency_key !== "string" ||
    body.idempotency_key.length < 8
  )
    return NextResponse.json(
      { error_code: "PLAN_VERSION_CONFLICT" },
      { status: 400, headers: privateHeaders },
    );
  const version = body.expected_concurrency_version as number;
  const key = body.idempotency_key;
  let call:
    | { functionName: string; args: Record<string, boolean | number | string> }
    | undefined;
  switch (body.action) {
    case "start":
      if (body.step_id)
        call = {
          functionName: "start_breeding_step",
          args: {
            p_step_id: body.step_id,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "continue":
      if (body.step_id)
        call = {
          functionName: "continue_breeding_attempt",
          args: {
            p_step_id: body.step_id,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "skip":
      if (body.step_id && body.reason)
        call = {
          functionName: "skip_breeding_step",
          args: {
            p_step_id: body.step_id,
            p_reason: body.reason,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "select_existing":
      if (
        body.step_id &&
        body.pal_instance_uid &&
        typeof body.allow_passive_mismatch === "boolean"
      )
        call = {
          functionName: "select_existing_pal_for_step",
          args: {
            p_step_id: body.step_id,
            p_pal_instance_uid: body.pal_instance_uid,
            p_allow_passive_mismatch: body.allow_passive_mismatch,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "confirm":
      if (body.step_id && body.candidate_key)
        call = {
          functionName: "confirm_offspring_candidate",
          args: {
            p_step_id: body.step_id,
            p_candidate_key: body.candidate_key,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "reject":
      if (body.candidate_key && body.reason)
        call = {
          functionName: "reject_offspring_candidate",
          args: {
            p_candidate_key: body.candidate_key,
            p_reason: body.reason,
            p_expected_concurrency_version: version,
            p_idempotency_key: key,
          },
        };
      break;
    case "pause":
      call = {
        functionName: "pause_execution_plan",
        args: {
          p_plan_id: planId,
          p_expected_concurrency_version: version,
          p_idempotency_key: key,
        },
      };
      break;
    case "resume":
      call = {
        functionName: "resume_execution_plan",
        args: {
          p_plan_id: planId,
          p_expected_concurrency_version: version,
          p_idempotency_key: key,
        },
      };
      break;
    case "recalculate":
      if (body.reason)
        call = {
          functionName: "recalculate_execution_plan",
          args: {
            p_plan_id: planId,
            p_expected_concurrency_version: version,
            p_reason: body.reason,
            p_idempotency_key: key,
          },
        };
      break;
  }
  if (call === undefined)
    return NextResponse.json(
      { error_code: "PLAN_INVALID_STATE_TRANSITION" },
      { status: 400, headers: privateHeaders },
    );
  const { data, error } = await supabase.rpc(
    call.functionName as never,
    call.args as never,
  );
  if (error !== null) {
    const code = safePlanErrorCode(error);
    return NextResponse.json(
      { error_code: code },
      { status: planHttpStatus(code), headers: privateHeaders },
    );
  }
  return NextResponse.json(data, { headers: privateHeaders });
}
