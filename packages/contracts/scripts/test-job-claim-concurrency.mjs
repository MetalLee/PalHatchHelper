import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required and must point to a local database",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Refusing to test a non-local database");
}

const connectionA = postgres(databaseUrl, { max: 1, prepare: false });
const connectionB = postgres(databaseUrl, { max: 1, prepare: false });
const serviceClaims = JSON.stringify({ role: "service_role" });
const playerClaims = JSON.stringify({
  role: "authenticated",
  sub: "00000000-0000-4000-8000-000000000002",
});
const idempotencyKey = "concurrent-idempotency-key";

async function beginAs(sql, claims, role) {
  await sql.unsafe("begin");
  await sql`select set_config('request.jwt.claims', ${claims}, true)`;
  await sql.unsafe("set local statement_timeout = '5s'");
  await sql.unsafe(`set local role ${role}`);
}

async function rollbackBoth() {
  await Promise.allSettled([
    connectionA.unsafe("rollback"),
    connectionB.unsafe("rollback"),
  ]);
}

async function verifyClaimConcurrency() {
  await beginAs(connectionA, serviceClaims, "service_role");
  await beginAs(connectionB, serviceClaims, "service_role");

  try {
    const [firstClaim] = await connectionA`
      select id
      from public.claim_breeding_job('concurrency-worker-a')
    `;
    if (!firstClaim) {
      throw new Error(
        "Expected the first Worker to claim the seeded pending job",
      );
    }

    const secondClaims = await connectionB`
      select id
      from public.claim_breeding_job('concurrency-worker-b')
    `;
    if (secondClaims.some((claim) => claim.id === firstClaim.id)) {
      throw new Error("Two concurrent Workers claimed the same breeding job");
    }

    console.log(
      `Concurrent claim check passed; ${firstClaim.id} remained leased only by Worker A.`,
    );
  } finally {
    await rollbackBoth();
  }
}

async function verifyIdempotencyConcurrency() {
  await connectionA`
    delete from public.breeding_jobs
    where requester_user_id = '00000000-0000-4000-8000-000000000002'
      and idempotency_key = ${idempotencyKey}
  `;
  await beginAs(connectionA, playerClaims, "authenticated");
  await beginAs(connectionB, playerClaims, "authenticated");
  let connectionACommitted = false;

  try {
    await connectionA`
      select *
      from public.create_breeding_job(
        'concurrency_target_a',
        array['test_passive_a'],
        'balanced',
        ${idempotencyKey}
      )
    `;

    const conflictingRequest = connectionB`
      select *
      from public.create_breeding_job(
        'concurrency_target_b',
        array['test_passive_b'],
        'balanced',
        ${idempotencyKey}
      )
    `.then(
      (rows) => ({ rows }),
      (error) => ({ error }),
    );

    await new Promise((resolve) => setTimeout(resolve, 250));
    await connectionA.unsafe("commit");
    connectionACommitted = true;
    const conflict = await conflictingRequest;
    if (!("error" in conflict)) {
      throw new Error(
        "Concurrent requests reused one idempotency key with different fingerprints",
      );
    }
    if (
      conflict.error.code !== "P0001" ||
      conflict.error.message !== "IDEMPOTENCY_KEY_CONFLICT"
    ) {
      throw conflict.error;
    }

    console.log("Concurrent idempotency conflict check passed.");
  } finally {
    const pendingRollbacks = [connectionB.unsafe("rollback")];
    if (!connectionACommitted) {
      pendingRollbacks.push(connectionA.unsafe("rollback"));
    }
    await Promise.allSettled(pendingRollbacks);
    await connectionA`
      delete from public.breeding_jobs
      where requester_user_id = '00000000-0000-4000-8000-000000000002'
        and idempotency_key = ${idempotencyKey}
    `;
  }
}

try {
  await verifyClaimConcurrency();
  await verifyIdempotencyConcurrency();
} finally {
  await Promise.allSettled([connectionA.end(), connectionB.end()]);
}
