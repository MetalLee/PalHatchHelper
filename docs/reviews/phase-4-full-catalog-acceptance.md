---
decision: approved_for_private_internal_use
approved_by: MetalLee
approved_at: 2026/7/16
status: published_to_local_test_world
scope: private_internal_use
target_server_build_id: "24181105"
candidate_version_id: f2718a96-5463-43ff-863e-225102bdfca2
candidate_status: validated
content_hash: 872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3
published_version_id: f2718a96-5463-43ff-863e-225102bdfca2
published_version_status: published
published_at: 2026-07-16T05:33:21.888027Z
local_test_world_id: 10000000-0000-4000-8000-000024181105
previous_version_id: 51000000-0000-4000-8000-000000000001
rollback_exercise: passed
restored_active_version_id: f2718a96-5463-43ff-863e-225102bdfca2
final_deterministic_digest: 656b27f1442b759cf78acd2d3197c094a28bafccfa878352a12318711de10082
production_publish: not_started
risk_acceptance:
  client_and_server_app_ids_are_different: true
  client_and_server_game_versions_match: true
  both_build_ids_and_manifests_are_fixed: true
  mappings_usmap_is_fixed: true
  source_package_fingerprint_is_fixed: true
  extractor_commit_is_fixed: true
  private_internal_use_only: true
  public_redistribution_allowed: false
---

# Phase 4 full catalog acceptance — Build 24181105

## Decision boundary

The project owner approved the validated candidate for private internal use. The
approved version was published only to the local test world, exercised through
rollback and recovery, and warmed through the exact-version cache. No production
Supabase access, Vercel deployment, Palworld container change, or production publish
was performed.

The current published fixture is fictional test data, not a previous real Palworld
catalog version. It is used only as a local difference and rollback baseline.

## Fixed package and provenance

| Fact                                      | Audited value                                                      |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Package                                   | `palworld-catalog-24181105-872e4a79af5b.tar.zst`                   |
| Package SHA-256                           | `8c36cb60e4f78c3e4c7681cde602539b4b85f160d26392ed0144f728c6f191a9` |
| Content hash                              | `872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3` |
| Canonical source package manifest SHA-256 | `ed7d9aefb8cae7f4e29810bc7bcd5155f0dec147ac25527eb24a10a30f6b182a` |
| `Mappings.usmap` SHA-256                  | `561ef13c8ee3cf785e4de8aa5bc9b3ad1646e416d895f1d1166fa27ebdfd26b0` |
| Extraction audit commit                   | `93e26a747b3196e1698eeaf21e3f10e8a6db35e4`                         |
| Extractor commit                          | `705f9144a0f1c8891a3129e7db1db597ab97a109`                         |
| PalCalc reference commit                  | `b822c7fda4f019bd7c57f45437f14a74061a29bc`                         |
| CUE4Parse                                 | `1.2.2.202607`                                                     |
| Compatibility                             | `exact_game_version_match`                                         |

The source package manifest hash is calculated over canonical JSON, matching the
extractor implementation and Linux validator. The sidecar file has a trailing LF;
its raw-file hash is therefore not substituted for the canonical package fingerprint.

| Runtime       |  App ID | Build ID | Game version    | appmanifest SHA-256                                                |
| ------------- | ------: | -------: | --------------- | ------------------------------------------------------------------ |
| Source client | 1623730 | 24181527 | `v1.0.1.100619` | `e0751824680f7de12cf79ee77ec888b8d2cdba9f682d7667c0562bb05f6450c6` |
| Target server | 2394010 | 24181105 | `v1.0.1.100619` | `98ef29829ebfde6d71528f5a83883e6bfda96fa77ce363e52630205353c1a189` |

The target appmanifest was re-hashed read-only and the running container log again
reported `Game version is v1.0.1.100619`. No server update was observed.

## Package safety

The package contains exactly 13 unique regular files. It has no absolute or parent
paths, links, devices, duplicate paths, hidden additions, appmanifest, `.pak`,
`.utoc`, `.ucas`, Unreal asset, executable, mapping, image, audio, or model files.
All archive members compare byte-for-byte with the atomically installed ignored
catalog directory. `checksums.sha256` passes for all seven JSONL files.

Both the package and extracted directory are Git-ignored; `git ls-files
data/game-catalog` is empty. `pnpm check:forbidden-assets` and the repository secret
scan pass.

## Local candidate

| Field                   | Value                                        |
| ----------------------- | -------------------------------------------- |
| Source ID               | `76000000-0000-4000-8000-000000241811`       |
| Candidate version ID    | `f2718a96-5463-43ff-863e-225102bdfca2`       |
| Status                  | `validated`                                  |
| Imported at             | `2026-07-16T03:32:16.621065+00:00`           |
| Content hash uniqueness | one version                                  |
| Retry result            | second full stage reused the same version ID |

The Agent used `begin_game_data_import`, retryable `stage_catalog_batch` batches,
and `finalize_catalog_import`. No direct SQL insert was used for catalog data. The
published fixture and both world pointers remained unchanged at
`51000000-0000-4000-8000-000000000001`.

| Entity            | Manifest | Database |
| ----------------- | -------: | -------: |
| pals              |      288 |      288 |
| passive_skills    |      115 |      115 |
| active_skills     |      227 |      227 |
| pal_active_skills |     2200 |     2200 |
| partner_skills    |      287 |      287 |
| breeding_recipes  |    41617 |    41617 |
| localizations     |     6234 |     6234 |

Validation totals are: unresolved 0, Stable ID collisions 0, recipe conflicts 0,
missing localization 0, and silent exclusions 0.

## Partner skill coverage

The unique included Pal without a partner skill is `plantslime_flower`, sourced from
`PlantSlime_Flower`. Its Pal evidence is the row in
`Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter.uasset`, including
`CombiRank`, elements, name override, rarity, and Paldeck index. No
`PARTNERSKILL_PlantSlime_Flower` localization exists in any extracted locale.

The audited extractor checks every included Pal. A missing partner localization is
recorded as stable reason `PARTNER_SKILL_NOT_DEFINED`; missing parameter or Blueprint
evidence would instead be unresolved. Therefore this is an explicit source absence,
not a silent extraction omission.

`partner_skill_count 287 + explicit_no_partner_skill_count 1 =
requiring_partner_skill_pal_count 288`.

## Passive coverage

| Metric                   | Count |
| ------------------------ | ----: |
| source_passive_count     |  1905 |
| included_passive_count   |   115 |
| excluded_passive_count   |  1790 |
| unresolved_passive_count |     0 |

The 1790 exclusions are rows whose source `Category` is not `SortDisplayable` or is a
`GYM_` internal row. All displayable positive and negative ranks are retained; the
catalog includes real negative ranks such as `-1` and `-3`.

## Exclusion audit

| Entity            | Stable reason                          |    Count | Source evidence / classification                                               |
| ----------------- | -------------------------------------- | -------: | ------------------------------------------------------------------------------ |
| active_skills     | `ACTIVE_SKILL_DISABLED`                |        9 | `DT_WazaDataTable.DisabledData`; disabled source row                           |
| active_skills     | `ACTIVE_SKILL_NOT_CATALOG_VISIBLE`     |      118 | action-skill name missing in one or more required locales; non-UI/internal row |
| active_skills     | `ACTIVE_SKILL_UNREFERENCED`            |       30 | not referenced by `DT_PalMasterLevel`; unused source row                       |
| breeding_recipes  | `SPECIAL_COMBINATION_NOT_RELEASED`     |       73 | unique breeding parent/child tribe does not resolve to released included Pals  |
| pal_active_skills | `PAL_ACTIVE_PAL_NOT_RELEASED`          |     3396 | master-level Pal resolves only to excluded NPC/Boss/test/variant assets        |
| pal_active_skills | `PAL_ACTIVE_SKILL_NOT_CATALOG_VISIBLE` |      176 | master-level skill resolves only to excluded/non-visible active skill          |
| pals              | `BOSS_VARIANT`                         |      412 | `IsBoss`, `IsRaidBoss`, or `IsTowerBoss`                                       |
| pals              | `GYM_VARIANT`                          |        1 | stable `GYM_` source-name class                                                |
| pals              | `OILRIG_VARIANT`                       |        6 | stable `_Oilrig` source-name class                                             |
| pals              | `PALDEX_NOT_RELEASED`                  |       12 | `ZukanIndex <= 0`                                                              |
| pals              | `PAL_CONFIGURATION_INCOMPLETE`         |        1 | non-positive rarity, speed, or breeding rank                                   |
| pals              | `PAL_ICON_MISSING`                     |       23 | no matching Pal icon for character or tribe                                    |
| pals              | `POLICE_VARIANT`                       |        2 | stable `POLICE` source-name class                                              |
| pals              | `QUEST_VARIANT`                        |        5 | stable quest source-name class                                                 |
| pals              | `SUMMON_VARIANT`                       |        3 | stable `SUMMON_` source-name class                                             |
| partner_skills    | `PARTNER_SKILL_NOT_DEFINED`            |        1 | explicit `PlantSlime_Flower` absence described above                           |
| passive_skills    | `PASSIVE_NOT_DISPLAYABLE`              |     1790 | source category is not displayable or is a Gym internal row                    |
| **Total**         |                                        | **6058** | silent exclusion count 0                                                       |

Fixed-seed exclusion samples (SHA-256 ordering of category, reason, and source name):

1. `pals / BOSS_VARIANT / BOSS_ElecSnail_Ground`
2. `passive_skills / PASSIVE_NOT_DISPLAYABLE / DefenseUp_Dark_PartnerSkill_2`
3. `pals / BOSS_VARIANT / BOSS_GoldenHorse`
4. `pal_active_skills / PAL_ACTIVE_PAL_NOT_RELEASED / BOSS_ElecSnail_Ground022`
5. `passive_skills / PASSIVE_NOT_DISPLAYABLE / AttackUp_IfAllOtomoTribeDifferent_PartnerSkill_4`
6. `pal_active_skills / PAL_ACTIVE_PAL_NOT_RELEASED / BOSS_SakuraSaurus_Water015`
7. `pal_active_skills / PAL_ACTIVE_PAL_NOT_RELEASED / BOSS_NightLady_Dark015`
8. `passive_skills / PASSIVE_NOT_DISPLAYABLE / InvalidSlipDamage_Poison_PartnerSkill`
9. `pal_active_skills / PAL_ACTIVE_PAL_NOT_RELEASED / LizardMan_Oilrig050`
10. `pal_active_skills / PAL_ACTIVE_PAL_NOT_RELEASED / RAID_NightLady_Dark008`

## Difference baseline

The existing breeding-only RPC correctly rejects this comparison with
`BREEDING_BASE_CATALOG_MISMATCH`, because its contract permits breeding-only changes
only when the non-breeding base is identical. A read-only full relational comparison
against the fictional fixture produced:

| Entity            | Added | Removed fixture rows | Changed |
| ----------------- | ----: | -------------------: | ------: |
| pals              |   288 |                    8 |       0 |
| passive_skills    |   115 |                    3 |       0 |
| active_skills     |   227 |                    0 |       0 |
| pal_active_skills |  2200 |                    0 |       0 |
| partner_skills    |   287 |                    0 |       0 |
| breeding_recipes  | 41617 |                    0 |       0 |
| localizations     |  6234 |                    6 |       0 |

## Fixed-seed samples and route smoke

Seed expression: `phase4-build-24181105|<stable-record-key>`, ordered by SHA-256.
Each 30-record sample passed ID, reference, source evidence, and English/zh-CN
localization checks.

| Sample         | Count | Sample-list digest                                                 | First three keys                                                                                  |
| -------------- | ----: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Pal + elements |    30 | `3d0cfe51db70d66e86fa8df6fcdc691fd4aa134177f6eb373cd2285f64850a39` | `samuraidog`, `redarmorbird`, `eleclizard`                                                        |
| passive        |    30 | `1fb7846c284a9035b8f84fb331ab46391bedd4b49e512afdda26a0c90a3d1ffe` | `pal_fullstomach_up_1`, `nocturnal`, `worldtree_def`                                              |
| active         |    30 | `d3602697ce35d0fc800275ead8c5bcea81c5806723ac6d42fa3aad171c4f479d` | `unique_ghostbeast_tossin`, `commetrain`, `unique_amaterasuwolf_dark_bite`                        |
| Pal-active     |    30 | `540a9c5a2cf75d41459a60e42c0a1fd4ca5ad252af15586579da616bb8486c9e` | `flyingmanta / bubbleshot / 22`, `foxexorcist / flarearrow / 7`, `ghostanglerfish / seagush / 70` |
| partner        |    30 | `ae0ef1d45edba0422f6c1c374cdda1a9ce76dcf622be45af6e00f0e5a24211f5` | `partnerskill_grassgolem`, `partnerskill_lazycatfish_gold`, `partnerskill_whitemoth_neutral`      |
| normal recipe  |    30 | `59dd504574e71f5f0478f53595e04bb84ea09160da0ba8164a915831a5c49f24` | three canonical parent/gender keys retained in test output                                        |

All 81 special recipe rows were summarized and checked for special priority. The ten
fixed real targets below were each searched twice with exact version/hash inputs;
results were byte-identical, A×B equaled B×A, every result ID existed, and the wrong
content hash was rejected.

| Target       | Result digest                                                      |
| ------------ | ------------------------------------------------------------------ |
| birddragon   | `c0b2ea4583adbe9423255207b02c219da4a10c8b5dd9cf11b2a50de5b4a1590b` |
| clionetwins  | `4a7fa055155b851824e611415ae2606188cedadf7e244ed1c898ed05a5e3590f` |
| darkflamefox | `8c2ba71070d40a959e552c3f6485d49ac463a67a64c068e311de737628e8aa14` |
| deer         | `30c430423659bfa36c8784fe0d267dddfb1c5a15d3bdf7bde222dce9e4925414` |
| grassmammoth | `b1959e19fd7da386a0c8c8a43284815f366e94262488c91ecccde6ffc755cb4d` |
| icewitch     | `92475b9fffe6d4f1f9f6bc27c2db14aa1cc526c3a6460426e4868aaef1e60f0d` |
| lazydragon   | `3e8958488d33b3e78d199ecd6d39a14f65d2e77057705d22615d887b58a96cbf` |
| longcat      | `c30e1f3c3d4ffc907a3f935453bd0a6448a9c8a7bd74b1225695561942d1e192` |
| lotusdragon  | `613af48c3ac6b11e3f2e3ecbbd4bc7749c9ab920e5ca7c1509ce3d2e19d697aa` |
| sumodog      | `b4ec8aeaf33bba014c988af9e2b78c807da013859499a5c2ed68ab6f3bf3716f` |

Aggregate deterministic digest:
`656b27f1442b759cf78acd2d3197c094a28bafccfa878352a12318711de10082`.

## Validation results

| Gate                                             | Result                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Node / Python runtime                            | Node `22.23.1`; Python `3.12.13`                                                               |
| `pnpm install --frozen-lockfile`                 | passed                                                                                         |
| `pnpm check`                                     | passed; Agent 165 passed, 4 environment-gated tests skipped in this invocation                 |
| Agent integration test with loopback credentials | 1 passed                                                                                       |
| `uv run pytest tests/breeding`                   | 41 passed                                                                                      |
| ruff check / format check / mypy                 | passed; 66 typed source files                                                                  |
| real catalog acceptance tests                    | 3 passed; integrity/audit, route smoke, reproducible private bundle                            |
| package safety tests                             | 4 malicious member cases passed plus real tar.zst audit                                        |
| Parser Landlock                                  | ABI 4; parser sandbox tests passed fail-closed behavior                                        |
| `supabase db lint`                               | passed, no schema errors                                                                       |
| `supabase test db`                               | passed, 223 tests across 9 files                                                               |
| contracts generation/drift                       | passed                                                                                         |
| Stable ID cross-language                         | TypeScript and Python tests passed; Windows .NET 10 x64 extractor checks passed in Draft PR CI |
| Web unit/build                                   | passed in `pnpm check`                                                                         |
| iPhone Playwright                                | 5 passed after installing the locked test browser/runtime libraries                            |
| forbidden assets / secret scan                   | passed                                                                                         |

The Linux host does not provide `dotnet`, so Windows extractor verification is not
claimed as a local pass. It must come from the Draft PR required GitHub Actions check.

## Draft PR and CI

Draft PR [#5](https://github.com/MetalLee/PalHatchHelper/pull/5) targets `main` from
`agent/phase-4-full-catalog-acceptance-24181105` and remains unmerged. All applicable
required CI passed for the human-approval head
`040bb6371368c038da4727c72f24357cd30f3811`:

| Check                          | Result  |
| ------------------------------ | ------- |
| `.NET 10 x64 synthetic checks` | success |
| `Web and workspace`            | success |
| `Local Supabase database`      | success |
| `Python Agent`                 | success |
| `Structure, docs, and secrets` | success |
| `Phase 5 browser acceptance`   | success |

The Windows run compiled and tested the synthetic extractor on `windows-latest`. Its
new regression verifies that gender-qualified recipe outcomes retain distinct
canonical keys. The Phase 4 closure commit, including the forward database migration,
is subject to the same required checks before branch handoff.

## Rollback target and known limits

The recorded local rollback target is published fixture version
`51000000-0000-4000-8000-000000000001`. The local test world was created in one
audited local database transaction as `phase4-local-build-24181105`, with ID
`10000000-0000-4000-8000-000024181105` and both initial pointers fixed to that
rollback target.

The first publish attempt was atomically rejected because the existing fail-closed
breeding-only publish trigger treated JSON `null` provenance as an object. A failing
pgTAP regression reproduced `BREEDING_BASE_CATALOG_MISMATCH`; forward migration
`20260716020000_phase4_full_catalog_publish_null_provenance.sql` now treats only an
absent or JSON-null optional value as a full catalog while retaining the object
provenance mismatch gate. The targeted database test passes 20/20 and database lint
reports no errors.

The existing `catalog publish` RPC then published version
`f2718a96-5463-43ff-863e-225102bdfca2` at
`2026-07-16T05:33:21.888027Z`. Both active pointers moved to the new version, all
seven relational projections and the 41,617-row compatibility recipe projection
were present, and exact-version warm-cache metadata matched the version, content
hash, and Schema 1.1.0.

The rollback RPC returned both pointers to the old fixture, the old projection was
readable, and all three historical jobs retained their original snapshot and old
version IDs. The same publish RPC then restored both pointers to the approved
version. Final smoke testing retained aggregate deterministic digest
`656b27f1442b759cf78acd2d3197c094a28bafccfa878352a12318711de10082`.

Before publication, the validated candidate was intentionally unreadable to ordinary
authenticated users: direct candidate Pal and passive visibility both returned zero
through RLS. Browser and task access remain bound to a user's authorized world and
published pointers.

Known limits:

- this is private internal acceptance only; public redistribution is not allowed;
- the fixture diff is not a real old-version game diff;
- Draft PR remains intentionally unmerged while the local acceptance branch is closed;
- production Supabase publish and deployment remain not started and unauthorized;
- this local test publish does not authorize public redistribution.

## Human approval checklist

The project owner independently recorded the approval identity, actual approval date,
decision, and required risk-acceptance statements in the front matter. Those facts
remain human-owned and were not added or altered by Codex. The approval applies only
to private internal use and this local test publication.
