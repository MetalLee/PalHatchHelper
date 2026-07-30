import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import type { CanonicalSnapshot } from "../src/generated/canonical-snapshot";
import type { InventoryPublishRpcRequest } from "../src/generated/inventory-sync";

const schema = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "schema/canonical-snapshot.schema.json"),
    "utf8",
  ),
) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("canonical snapshot contract", () => {
  it("accepts the normalized inventory boundary", () => {
    const snapshot: CanonicalSnapshot = {
      server: {
        world_uid: "fixture-world-001",
        save_version: "fixture-v1",
        captured_at: "2026-07-14T03:00:00Z",
      },
      guilds: [{ guild_uid: "fixture-guild-001", name: "Fixture Guild" }],
      players: [
        {
          player_uid: "fixture-player-001",
          nickname: "Redacted Player",
          level: 20,
          guild_uid: "fixture-guild-001",
        },
      ],
      pals: [
        {
          instance_uid: "fixture-pal-instance-001",
          owner_player_uid: "fixture-player-001",
          guild_uid: "fixture-guild-001",
          pal_id: "Lamball",
          is_boss: true,
          gender: "female",
          level: 12,
          passive_skill_ids: ["Artisan"],
          location_type: "base",
          location_name: "Fixture Base",
          location_id: "fixture-base-001",
          location_slot_index: 7,
          location_access_scope: "guild",
        },
      ],
      bases: [
        {
          base_id: "fixture-base-001",
          guild_uid: "fixture-guild-001",
          name: "Fixture Base",
        },
      ],
      item_stacks: [
        {
          container_id: "fixture-container-001",
          item_id: "Wood",
          quantity: 120,
          container_type: "storage_box",
          base_id: "fixture-base-001",
          guild_uid: "fixture-guild-001",
          slot_index: 3,
          resolution_status: "resolved",
        },
      ],
      item_inventory_status: "available",
    };

    expect(validate(snapshot), JSON.stringify(validate.errors)).toBe(true);
  });
});

describe("inventory synchronization contracts", () => {
  it("includes the complete publication request and Agent RPC types", () => {
    const inventorySchema = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "schema/inventory-sync.schema.json"),
        "utf8",
      ),
    ) as object & { title?: string };
    const itemInventorySchema = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "schema/item-inventory.schema.json"),
        "utf8",
      ),
    ) as object;
    const databaseTypes = readFileSync(
      resolve(process.cwd(), "src/database.types.ts"),
      "utf8",
    );

    const publishRequest: InventoryPublishRpcRequest = {
      world_id: "10000000-0000-4000-8000-000000000001",
      snapshot: {
        source_save_hash: "b".repeat(64),
        source_modified_at: "2026-07-14T03:00:00Z",
        save_version: "fixture-v1",
        captured_at: "2026-07-14T03:00:00Z",
        parser_name: "fixture-parser",
        parser_version: "1.0.0",
        server: {
          world_uid: "fixture-world-001",
          save_version: "fixture-v1",
          captured_at: "2026-07-14T03:00:00Z",
        },
        guilds: [{ guild_uid: "fixture-guild-001", name: "Fixture Guild" }],
        players: [],
        pals: [],
        bases: [],
        item_stacks: [],
        item_inventory_status: "available",
        warnings: [],
      },
    };
    const inventoryAjv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(inventoryAjv);
    inventoryAjv.addSchema(schema);
    inventoryAjv.addSchema(itemInventorySchema);
    const validateInventory = inventoryAjv.compile(inventorySchema);

    expect(inventorySchema.title).toBe("InventoryPublishRpcRequest");
    expect(
      validateInventory(publishRequest),
      JSON.stringify(validateInventory.errors),
    ).toBe(true);
    expect(databaseTypes).toContain("publish_inventory_snapshot:");
    expect(databaseTypes).toContain("get_latest_inventory_snapshot_for_agent:");
    expect(databaseTypes).toContain("get_inventory_catalog_ids_for_agent:");
  });
});
