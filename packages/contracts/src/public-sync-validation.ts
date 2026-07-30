import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import canonicalSchema from "../schema/canonical-snapshot.schema.json";
import inventorySchema from "../schema/inventory-sync.schema.json";
import itemInventorySchema from "../schema/item-inventory.schema.json";
import syncSchema from "../schema/sync-api.schema.json";
import type { CanonicalSnapshot } from "./generated/canonical-snapshot";
import type { InventoryPublishPayload } from "./generated/inventory-sync";
import type {
  SyncHeartbeatRequest,
  SyncPairRequest,
} from "./generated/sync-api";

export class PublicSyncContractError extends Error {
  constructor(code: "SYNC_PAYLOAD_INVALID" | "SYNC_REQUEST_INVALID") {
    super(code);
  }
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(canonicalSchema);
ajv.addSchema(itemInventorySchema);
ajv.addSchema(inventorySchema);
ajv.addSchema(syncSchema);

function definitionValidator(
  schema: object & { $defs?: object },
  definition: string,
) {
  return ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  });
}

const registeredInventoryValidator = ajv.getSchema(
  "https://palhatch.local/schemas/inventory-sync.schema.json#/$defs/InventoryPublishPayload",
);
const registeredCanonicalValidator = ajv.getSchema(
  "https://palhatch.local/schemas/canonical-snapshot.schema.json",
);
const validatePair = definitionValidator(syncSchema, "SyncPairRequest");
const validateHeartbeat = definitionValidator(
  syncSchema,
  "SyncHeartbeatRequest",
);

if (
  registeredInventoryValidator === undefined ||
  registeredCanonicalValidator === undefined
) {
  throw new Error("PUBLIC_SYNC_SCHEMA_NOT_REGISTERED");
}
const validateInventory: ValidateFunction = registeredInventoryValidator;
const validateCanonical: ValidateFunction = registeredCanonicalValidator;

function parse<T>(
  validate: ValidateFunction,
  value: unknown,
  code: "SYNC_PAYLOAD_INVALID" | "SYNC_REQUEST_INVALID",
): T {
  if (!validate(value)) throw new PublicSyncContractError(code);
  return value as T;
}

export function parseInventoryPublishPayload(
  value: unknown,
): InventoryPublishPayload {
  return parse(validateInventory, value, "SYNC_PAYLOAD_INVALID");
}

export function parseCanonicalSnapshot(value: unknown): CanonicalSnapshot {
  return parse(validateCanonical, value, "SYNC_PAYLOAD_INVALID");
}

export function parseSyncPairRequest(value: unknown): SyncPairRequest {
  return parse(validatePair, value, "SYNC_REQUEST_INVALID");
}

export function parseSyncHeartbeatRequest(
  value: unknown,
): SyncHeartbeatRequest {
  return parse(validateHeartbeat, value, "SYNC_REQUEST_INVALID");
}
