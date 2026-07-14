from collections.abc import Set
from dataclasses import dataclass

from pal_hatch_helper.generated import CanonicalPal, CanonicalPlayer, CanonicalSnapshot
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


@dataclass(frozen=True, slots=True)
class ValidationWarning:
    code: str
    path: str
    value: str


@dataclass(frozen=True, slots=True)
class ValidatedPal:
    canonical: CanonicalPal
    owner_resolved: bool
    guild_resolved: bool
    shared_eligible: bool
    warning_codes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ValidatedSnapshot:
    canonical: CanonicalSnapshot
    warnings: tuple[ValidationWarning, ...]
    pals: tuple[ValidatedPal, ...]


class CanonicalSnapshotValidator:
    def __init__(
        self,
        *,
        expected_world_uid: str,
        known_pal_ids: Set[str],
        known_passive_skill_ids: Set[str],
    ) -> None:
        self._expected_world_uid = expected_world_uid
        self._known_pal_ids = frozenset(known_pal_ids)
        self._known_passive_skill_ids = frozenset(known_passive_skill_ids)

    def validate(self, snapshot: CanonicalSnapshot) -> ValidatedSnapshot:
        if snapshot.server.world_uid != self._expected_world_uid:
            raise StructuredError(
                code=ErrorCode.CANONICAL_WORLD_UID_MISMATCH,
                summary="Canonical snapshot world UID does not match the configured world.",
                retryable=False,
            )

        guilds: dict[str, str] = {}
        for guild in snapshot.guilds:
            previous_name = guilds.setdefault(guild.guild_uid, guild.name)
            if previous_name != guild.name:
                raise StructuredError(
                    code=ErrorCode.CANONICAL_GUILD_UID_CONFLICT,
                    summary="A guild UID maps to conflicting canonical records.",
                    retryable=False,
                )

        players: dict[str, CanonicalPlayer] = {}
        for player in snapshot.players:
            previous = players.setdefault(player.player_uid, player)
            if previous != player:
                raise StructuredError(
                    code=ErrorCode.CANONICAL_PLAYER_UID_CONFLICT,
                    summary="A player UID maps to conflicting canonical records.",
                    retryable=False,
                )

        instance_uids: set[str] = set()
        warnings: list[ValidationWarning] = []
        validated_pals: list[ValidatedPal] = []
        for index, pal in enumerate(snapshot.pals):
            if pal.instance_uid in instance_uids:
                raise StructuredError(
                    code=ErrorCode.CANONICAL_PAL_UID_DUPLICATE,
                    summary="A Pal instance UID occurs more than once in the canonical snapshot.",
                    retryable=False,
                )
            instance_uids.add(pal.instance_uid)
            pal_warnings: list[str] = []
            if pal.pal_id not in self._known_pal_ids:
                pal_warnings.append("UNKNOWN_PAL")
                warnings.append(
                    ValidationWarning("UNKNOWN_PAL", f"pals[{index}].pal_id", pal.pal_id)
                )
            for passive_id in pal.passive_skill_ids:
                if passive_id not in self._known_passive_skill_ids:
                    pal_warnings.append("UNKNOWN_PASSIVE")
                    warnings.append(
                        ValidationWarning(
                            "UNKNOWN_PASSIVE",
                            f"pals[{index}].passive_skill_ids",
                            passive_id,
                        )
                    )

            owner = players.get(pal.owner_player_uid) if pal.owner_player_uid is not None else None
            owner_resolved = owner is not None
            if not owner_resolved:
                pal_warnings.append("OWNER_UNRESOLVED")
                warnings.append(
                    ValidationWarning(
                        "OWNER_UNRESOLVED",
                        f"pals[{index}].owner_player_uid",
                        pal.owner_player_uid or "",
                    )
                )
            guild_resolved = pal.guild_uid is not None and pal.guild_uid in guilds
            if owner is not None:
                owner_guild_uid = owner.guild_uid
                guild_resolved = guild_resolved and owner_guild_uid == pal.guild_uid
            if not guild_resolved:
                pal_warnings.append("GUILD_UNRESOLVED")
                warnings.append(
                    ValidationWarning(
                        "GUILD_UNRESOLVED",
                        f"pals[{index}].guild_uid",
                        pal.guild_uid or "",
                    )
                )
            validated_pals.append(
                ValidatedPal(
                    canonical=pal,
                    owner_resolved=owner_resolved,
                    guild_resolved=guild_resolved,
                    shared_eligible=owner_resolved and guild_resolved,
                    warning_codes=tuple(dict.fromkeys(pal_warnings)),
                )
            )

        return ValidatedSnapshot(
            canonical=snapshot,
            warnings=tuple(warnings),
            pals=tuple(validated_pals),
        )
