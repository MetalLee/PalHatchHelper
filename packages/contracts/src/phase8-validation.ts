import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/phase8-admin.schema.json";
import type {
  AdminAuditEvent,
  AdminBindingCandidate,
  AdminBindingEvent,
  AdminCatalogVersion,
  AdminError,
  AdminJobSummary,
  AdminOverview,
  AdminSaveParserStatus,
  RuntimeSettingsVersion,
  RuntimeSettings,
  SecretConfigurationStatus,
} from "./generated/phase8-admin";

export class Phase8ContractError extends Error {
  constructor() {
    super("PHASE8_CONTRACT_INVALID");
  }
}

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
ajv.addSchema(schema);

function validator(definition?: string, array = false): ValidateFunction {
  const reference =
    definition === undefined
      ? { $ref: schema.$id }
      : { $ref: `${schema.$id}#/$defs/${definition}` };
  return ajv.compile(
    array
      ? {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "array",
          items: reference,
        }
      : {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          ...reference,
        },
  );
}

function parse<T>(validate: ValidateFunction, value: unknown): T {
  if (!validate(value)) throw new Phase8ContractError();
  return value as T;
}

const validateOverview = validator();
const validateSaveParser = validator("AdminSaveParserStatus");
const validateBindingCandidates = validator("AdminBindingCandidate", true);
const validateBindingEvents = validator("AdminBindingEvent", true);
const validateCatalogVersions = validator("AdminCatalogVersion", true);
const validateJobs = validator("AdminJobSummary", true);
const validateSettings = validator("RuntimeSettingsVersion");
const validateSettingsPayload = validator("RuntimeSettings");
const validateAudit = validator("AdminAuditEvent", true);
const validateError = validator("AdminError");
const validateSecretStatuses = validator("SecretConfigurationStatus", true);

export const parseAdminOverview = (value: unknown): AdminOverview =>
  parse(validateOverview, value);
export const parseAdminSaveParserStatus = (
  value: unknown,
): AdminSaveParserStatus => parse(validateSaveParser, value);
export const parseAdminBindingCandidates = (
  value: unknown,
): AdminBindingCandidate[] => parse(validateBindingCandidates, value);
export const parseAdminBindingEvents = (value: unknown): AdminBindingEvent[] =>
  parse(validateBindingEvents, value);
export const parseAdminCatalogVersions = (
  value: unknown,
): AdminCatalogVersion[] => parse(validateCatalogVersions, value);
export const parseAdminJobs = (value: unknown): AdminJobSummary[] =>
  parse(validateJobs, value);
export const parseRuntimeSettingsVersion = (
  value: unknown,
): RuntimeSettingsVersion => parse(validateSettings, value);
export const parseRuntimeSettings = (value: unknown): RuntimeSettings =>
  parse(validateSettingsPayload, value);
export const parseAdminAuditEvents = (value: unknown): AdminAuditEvent[] =>
  parse(validateAudit, value);
export const parseAdminError = (value: unknown): AdminError =>
  parse(validateError, value);
export const parseSecretConfigurationStatuses = (
  value: unknown,
): SecretConfigurationStatus[] => parse(validateSecretStatuses, value);
