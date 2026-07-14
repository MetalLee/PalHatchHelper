import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/phase5-web.schema.json";
import type {
  InventoryDataStatusRpcResult,
  PalInventoryRpcResult,
  Phase5Error,
  ShareMutationRpcResult,
} from "./generated/phase5-web";

export class Phase5ContractError extends Error {
  constructor() {
    super("PHASE5_CONTRACT_INVALID");
  }
}

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);

function validator(definition: string): ValidateFunction {
  return ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  });
}

const validateInventory = validator("PalInventoryRpcResult");
const validateDataStatus = validator("InventoryDataStatusRpcResult");
const validateShareMutation = validator("ShareMutationRpcResult");
const validateError = validator("Phase5Error");

function parse<T>(validate: ValidateFunction, value: unknown): T {
  if (!validate(value)) throw new Phase5ContractError();
  return value as T;
}

export function parsePalInventoryRpcResult(
  value: unknown,
): PalInventoryRpcResult {
  return parse(validateInventory, value);
}

export function parseInventoryDataStatusRpcResult(
  value: unknown,
): InventoryDataStatusRpcResult {
  return parse(validateDataStatus, value);
}

export function parseShareMutationRpcResult(
  value: unknown,
): ShareMutationRpcResult {
  return parse(validateShareMutation, value);
}

export function parsePhase5Error(value: unknown): Phase5Error {
  return parse(validateError, value);
}
