import { createHash } from "node:crypto";

export function redactUidCore(rawUid) {
  return `pb1_${createHash("sha256").update(`palbeacon:v1:${rawUid}`).digest("hex")}`;
}

export function createInventoryPublishPayload(snapshot, metadata) {
  const guildIds = new Set(snapshot.guilds.map((guild) => guild.guild_uid));
  const bases = new Map(
    (snapshot.bases ?? []).map((base) => [base.base_id, base]),
  );
  const players = new Map(
    snapshot.players.map((player) => [player.player_uid, player]),
  );
  const warnings = [];

  return {
    source_save_hash: metadata.sourceHash,
    source_modified_at: metadata.sourceModifiedAt,
    save_version: snapshot.server.save_version,
    captured_at: snapshot.server.captured_at,
    parser_name: "palhatch-plm-save-parser",
    parser_version: metadata.parserVersion,
    server: {
      ...snapshot.server,
      world_uid: redactUidCore(snapshot.server.world_uid),
    },
    guilds: snapshot.guilds.map((guild) => ({
      ...guild,
      guild_uid: redactUidCore(guild.guild_uid),
    })),
    players: snapshot.players.map((player) => ({
      ...player,
      player_uid: redactUidCore(player.player_uid),
      guild_uid:
        player.guild_uid === null ? null : redactUidCore(player.guild_uid),
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
      const warningCodes = [];
      const warn = (code, path, value) => {
        if (!warningCodes.includes(code)) warningCodes.push(code);
        warnings.push({ code, path, value });
      };
      if (pal.gender === "unknown")
        warn("UNKNOWN_GENDER", `pals[${index}].gender`, "unknown");
      if (pal.level === null) warn("UNKNOWN_LEVEL", `pals[${index}].level`, "");
      if (pal.location_type === "unknown")
        warn("UNKNOWN_LOCATION", `pals[${index}].location_type`, "unknown");
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
        instance_uid: redactUidCore(pal.instance_uid),
        owner_player_uid:
          pal.owner_player_uid === null
            ? null
            : redactUidCore(pal.owner_player_uid),
        guild_uid: pal.guild_uid === null ? null : redactUidCore(pal.guild_uid),
        location_id:
          pal.location_id === null ? null : redactUidCore(pal.location_id),
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
    bases: (snapshot.bases ?? []).map((base) => ({
      ...base,
      base_id: redactUidCore(base.base_id),
      guild_uid: base.guild_uid === null ? null : redactUidCore(base.guild_uid),
    })),
    item_stacks: (snapshot.item_stacks ?? []).map((stack, index) => {
      const base =
        stack.base_id === null ? undefined : bases.get(stack.base_id);
      const baseResolved =
        base !== undefined &&
        stack.guild_uid !== null &&
        base.guild_uid === stack.guild_uid &&
        guildIds.has(stack.guild_uid);
      let resolutionStatus = stack.resolution_status;
      if (resolutionStatus === "resolved" && !baseResolved) {
        resolutionStatus = "unresolved";
        warnings.push({
          code: "ITEM_STACK_BASE_UNRESOLVED",
          path: `item_stacks[${index}].base_id`,
          value: "",
        });
      }
      return {
        ...stack,
        container_id: redactUidCore(stack.container_id),
        base_id: stack.base_id === null ? null : redactUidCore(stack.base_id),
        guild_uid:
          stack.guild_uid === null ? null : redactUidCore(stack.guild_uid),
        resolution_status: resolutionStatus,
      };
    }),
    item_inventory_status: snapshot.item_inventory_status ?? "unavailable",
    warnings,
  };
}
