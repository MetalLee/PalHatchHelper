import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../schema/item-inventory.schema.json";
import type {
  GuildItemInventoryResponse,
  ItemInventoryTrendResponse,
} from "./generated/item-inventory";

export class ItemInventoryContractError extends Error {
  constructor() {
    super("ITEM_INVENTORY_CONTRACT_INVALID");
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

const validateInventory = validator("GuildItemInventoryResponse");
const validateTrend = validator("ItemInventoryTrendResponse");

function parse<T>(validate: ValidateFunction, value: unknown): T {
  if (!validate(value)) throw new ItemInventoryContractError();
  return value as T;
}

export function parseGuildItemInventoryResponse(
  value: unknown,
): GuildItemInventoryResponse {
  return parse(validateInventory, value);
}

export function parseItemInventoryTrendResponse(
  value: unknown,
): ItemInventoryTrendResponse {
  return parse(validateTrend, value);
}
