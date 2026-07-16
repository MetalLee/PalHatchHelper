import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/phase6-breeder.schema.json";
import type {
  AIExplanation,
  BreederFormContextRpcResult,
  BreedingJobDetailRpcResult,
  CreateBreedingJobRequest,
  CreateBreedingJobResponse,
} from "./generated/phase6-breeder";

export class Phase6ContractError extends Error {
  constructor() {
    super("PHASE6_CONTRACT_INVALID");
  }
}

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);

function validator(definition?: string): ValidateFunction {
  return ajv.compile(
    definition === undefined
      ? schema
      : {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          $defs: schema.$defs,
          $ref: `#/$defs/${definition}`,
        },
  );
}

const validateCreateRequest = validator();
const validateCreateResponse = validator("CreateBreedingJobResponse");
const validateJobDetail = validator("BreedingJobDetailRpcResult");
const validateAIExplanation = validator("AIExplanation");
const validateFormContext = validator("BreederFormContextRpcResult");

function parse<T>(validate: ValidateFunction, value: unknown): T {
  if (!validate(value)) throw new Phase6ContractError();
  return value as T;
}

export function parseCreateBreedingJobRequest(
  value: unknown,
): CreateBreedingJobRequest {
  return parse(validateCreateRequest, value);
}

export function parseCreateBreedingJobResponse(
  value: unknown,
): CreateBreedingJobResponse {
  return parse(validateCreateResponse, value);
}

export function parseBreedingJobDetailRpcResult(
  value: unknown,
): BreedingJobDetailRpcResult {
  return parse(validateJobDetail, value);
}

export function parseAIExplanation(value: unknown): AIExplanation {
  return parse(validateAIExplanation, value);
}

export function parseBreederFormContextRpcResult(
  value: unknown,
): BreederFormContextRpcResult {
  return parse(validateFormContext, value);
}
