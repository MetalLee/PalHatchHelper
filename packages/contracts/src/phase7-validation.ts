import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/phase7-execution-plans.schema.json";
import type {
  PlanDetailRpcResult,
  PlanListRpcResult,
  RemovePlanResponse,
  SavePlanRequest,
  SavePlanResponse,
} from "./generated/phase7-execution-plans";

export class Phase7ContractError extends Error {
  constructor() {
    super("PHASE7_CONTRACT_INVALID");
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

function parse<T>(validate: ValidateFunction, value: unknown): T {
  if (!validate(value)) throw new Phase7ContractError();
  return value as T;
}

const validateSaveRequest = validator();
const validateSaveResponse = validator("SavePlanResponse");
const validateRemoveResponse = validator("RemovePlanResponse");
const validatePlanList = validator("PlanListRpcResult");
const validatePlanDetail = validator("PlanDetailRpcResult");

export const parseSavePlanRequest = (value: unknown): SavePlanRequest =>
  parse(validateSaveRequest, value);
export const parseSavePlanResponse = (value: unknown): SavePlanResponse =>
  parse(validateSaveResponse, value);
export const parseRemovePlanResponse = (value: unknown): RemovePlanResponse =>
  parse(validateRemoveResponse, value);
export const parsePlanListRpcResult = (value: unknown): PlanListRpcResult =>
  parse(validatePlanList, value);
export const parsePlanDetailRpcResult = (value: unknown): PlanDetailRpcResult =>
  parse(validatePlanDetail, value);
