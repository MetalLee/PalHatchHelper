import { createHash } from "node:crypto";

import {
  parseInventoryPublishPayload,
  type CanonicalSnapshot,
  type InventoryPublishPayload,
  type InventoryValidationWarning,
} from "@palhatch/contracts";

interface PublishMetadata {
  sourceHash: string;
  sourceModifiedAt: string;
  parserVersion: string;
}

export function redactUid(rawUid: string): string {
  return `pb1_${createHash("sha256").update(`palbeacon:v1:${rawUid}`).digest("hex")}`;
}

export function toInventoryPublishPayload(
  snapshot: CanonicalSnapshot,
  metadata: PublishMetadata,
): InventoryPublishPayload {
  const guildIds = new Set(snapshot.guilds.map((guild) => guild.guild_uid));
  const players = new Map(
    snapshot.players.map((player) => [player.player_uid, player]),
  );
  const warnings: InventoryValidationWarning[] = [];

  const payload: InventoryPublishPayload = {
    source_save_hash: metadata.sourceHash,
    source_modified_at: metadata.sourceModifiedAt,
    save_version: snapshot.server.save_version,
    captured_at: snapshot.server.captured_at,
    parser_name: "palhatch-plm-save-parser",
    parser_version: metadata.parserVersion,
    server: {
      ...snapshot.server,
      world_uid: redactUid(snapshot.server.world_uid),
    },
    guilds: snapshot.guilds.map((guild) => ({
      ...guild,
      guild_uid: redactUid(guild.guild_uid),
    })),
    players: snapshot.players.map((player) => ({
      ...player,
      player_uid: redactUid(player.player_uid),
      guild_uid: player.guild_uid === null ? null : redactUid(player.guild_uid),
    })),
    pals: snapshot.pals.map((pal, index) => {
      const owner =
        pal.owner_player_uid === null
          ? undefined
          : players.get(pal.owner_player_uid);
      let guildResolved = pal.guild_uid !== null && guildIds.has(pal.guild_uid);
      const guildOwned =
        pal.owner_player_uid === null &&
        pal.location_type === "base" &&
        guildResolved;
      const ownerResolved = owner !== undefined || guildOwned;
      if (owner !== undefined)
        guildResolved = guildResolved && owner.guild_uid === pal.guild_uid;
      const dimensionalAccessResolved =
        pal.location_type !== "dimensional_storage" ||
        pal.location_access_scope === "guild";
      const warningCodes: string[] = [];
      const warn = (code: string, path: string, value: string): void => {
        if (!warningCodes.includes(code)) warningCodes.push(code);
        warnings.push({ code, path, value });
      };
      if (pal.gender === "unknown")
        warn("UNKNOWN_GENDER", `pals[${index}].gender`, "unknown");
      if (pal.level === null) warn("UNKNOWN_LEVEL", `pals[${index}].level`, "");
      if (pal.location_type === "unknown") {
        warn("UNKNOWN_LOCATION", `pals[${index}].location_type`, "unknown");
      }
      if (
        pal.location_type === "dimensional_storage" &&
        pal.location_access_scope === "unresolved"
      ) {
        warn(
          "LOCATION_ACCESS_UNRESOLVED",
          `pals[${index}].location_access_scope`,
          "unresolved",
        );
      }
      if (!ownerResolved)
        warn("OWNER_UNRESOLVED", `pals[${index}].owner_player_uid`, "");
      if (!guildResolved)
        warn("GUILD_UNRESOLVED", `pals[${index}].guild_uid`, "");
      return {
        ...pal,
        instance_uid: redactUid(pal.instance_uid),
        owner_player_uid:
          pal.owner_player_uid === null
            ? null
            : redactUid(pal.owner_player_uid),
        guild_uid: pal.guild_uid === null ? null : redactUid(pal.guild_uid),
        location_id:
          pal.location_id === null ? null : redactUid(pal.location_id),
        metadata: null,
        ownership_scope: guildOwned
          ? "guild"
          : owner === undefined
            ? "unresolved"
            : "player",
        owner_resolved: ownerResolved,
        guild_resolved: guildResolved,
        shared_eligible:
          ownerResolved && guildResolved && dimensionalAccessResolved,
        warning_codes: warningCodes,
      };
    }),
    warnings,
  };
  return parseInventoryPublishPayload(payload);
}
