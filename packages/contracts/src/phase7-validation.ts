import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/phase7-execution-plans.schema.json";
import type {
  AdoptRouteRequest,
  AdoptRouteResponse,
  PlanDetailRpcResult,
  PlanListRpcResult,
  PlanMutationResponse,
  RecalculatePlanResponse,
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

const validateAdoptRequest = validator();
const validateAdoptResponse = validator("AdoptRouteResponse");
const validatePlanList = validator("PlanListRpcResult");
const validatePlanDetail = validator("PlanDetailRpcResult");
const validateMutation = validator("PlanMutationResponse");
const validateRecalculation = validator("RecalculatePlanResponse");

export const parseAdoptRouteRequest = (value: unknown): AdoptRouteRequest =>
  parse(validateAdoptRequest, value);
export const parseAdoptRouteResponse = (value: unknown): AdoptRouteResponse =>
  parse(validateAdoptResponse, value);
export const parsePlanListRpcResult = (value: unknown): PlanListRpcResult =>
  parse(validatePlanList, value);
export const parsePlanDetailRpcResult = (value: unknown): PlanDetailRpcResult =>
  parse(validatePlanDetail, value);
export const parsePlanMutationResponse = (
  value: unknown,
): PlanMutationResponse => parse(validateMutation, value);
export const parseRecalculatePlanResponse = (
  value: unknown,
): RecalculatePlanResponse => parse(validateRecalculation, value);
