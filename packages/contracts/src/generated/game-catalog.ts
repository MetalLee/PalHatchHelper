/* Generated from game-catalog.schema.json. Do not edit directly. */

/**
 * Manifest for one immutable, normalized game catalog version.
 */
export type GameCatalogManifest = {
  [k: string]: unknown;
} & {
  schema_version: SchemaVersion;
  game_build_id: NonEmptyText;
  game_version: NonEmptyText;
  package_hash: Sha256;
  content_hash: Sha256;
  extractor_name: NonEmptyText;
  extractor_version: NonEmptyText;
  created_at: string;
  /**
   * @minItems 1
   */
  locales: [Locale, ...Locale[]];
  counts: CatalogCounts;
  /**
   * @minItems 1
   */
  files: [CatalogFileChecksum, ...CatalogFileChecksum[]];
  compression: "tar.gz" | "tar.zst";
  breeding_source_provenance?: BreedingSourceProvenance | null;
  source_provenance?: SourceProvenance | null;
};
export type SchemaVersion = string;
export type NonEmptyText = string;
export type Sha256 = string;
export type Locale = string;
export type CompatibilityStatus = "exact_game_version_match" | "mismatch" | "unknown";
export type StableId = string;
export type TextKey = string;

export interface GameCatalogContracts {
  GameCatalogManifest: GameCatalogManifest;
  BreedingSourceProvenance: BreedingSourceProvenance;
  SourceProvenance: SourceProvenance;
  GameDataSource: GameDataSource;
  GameDataVersion: GameDataVersion;
  CatalogPal: CatalogPal;
  CatalogPassiveSkill: CatalogPassiveSkill;
  CatalogActiveSkill: CatalogActiveSkill;
  CatalogPalActiveSkill: CatalogPalActiveSkill;
  CatalogPartnerSkill: CatalogPartnerSkill;
  CatalogLocalization: CatalogLocalization;
  CatalogBreedingRecipe: CatalogBreedingRecipe;
  CatalogValidationReport: CatalogValidationReport;
  CatalogFileChecksum: CatalogFileChecksum;
}
export interface CatalogCounts {
  pals: number;
  passive_skills: number;
  active_skills: number;
  pal_active_skills: number;
  partner_skills: number;
  breeding_recipes: number;
  localizations: number;
}
export interface CatalogFileChecksum {
  filename:
    | "pals.jsonl"
    | "passive-skills.jsonl"
    | "active-skills.jsonl"
    | "pal-active-skills.jsonl"
    | "partner-skills.jsonl"
    | "breeding-recipes.jsonl"
    | "localizations.jsonl";
  sha256: Sha256;
  record_count: number;
}
export interface BreedingSourceProvenance {
  source_id: string;
  source_type: "github" | "url" | "upload";
  source_name: NonEmptyText;
  source_version: NonEmptyText;
  filename: string;
  raw_content_hash: Sha256;
  fetched_at: string;
  base_content_hash: Sha256;
}
export interface SourceProvenance {
  extraction_mode: "full_game_catalog";
  upstream_reference_repository: "tylercamp/palcalc";
  upstream_reference_commit: "b822c7fda4f019bd7c57f45437f14a74061a29bc";
  upstream_license: "MIT";
  extractor_repository_commit: string;
  extractor_build: NonEmptyText;
  cue4parse_version: "1.2.2.202607";
  source_client_app_id: "1623730";
  source_client_build_id: NonEmptyText;
  source_client_appmanifest_sha256: Sha256;
  source_client_game_version: NonEmptyText;
  target_server_app_id: "2394010";
  target_server_build_id: NonEmptyText;
  target_server_appmanifest_sha256: Sha256;
  target_server_game_version: NonEmptyText;
  mappings_usmap_sha256: Sha256;
  source_package_manifest_sha256: Sha256;
  extracted_at: string;
  compatibility_status: CompatibilityStatus;
  /**
   * @minItems 1
   */
  compatibility_evidence: [NonEmptyText, ...NonEmptyText[]];
}
export interface GameDataSource {
  id: string;
  name: NonEmptyText;
  source_type: "game_package" | "github" | "url" | "upload";
  source_path: string | null;
  source_url: string | null;
  enabled: boolean;
}
export interface GameDataVersion {
  id: string;
  game_build_id: string | null;
  game_version: string | null;
  package_hash: Sha256;
  content_hash: Sha256;
  schema_version: SchemaVersion;
  extractor_name: NonEmptyText;
  extractor_version: NonEmptyText;
  artifact_bucket: string | null;
  artifact_path: string | null;
  status: "extracting" | "staging" | "validated" | "published" | "rejected";
  imported_at: string;
  validated_at: string | null;
  published_at: string | null;
}
export interface CatalogPal {
  pal_id: StableId;
  encyclopedia_no: number | null;
  name_key: TextKey;
  /**
   * @minItems 1
   */
  element_types: [StableId, ...StableId[]];
  rarity: number;
  breeding_power: number;
  metadata: Metadata;
}
export interface Metadata {
  [k: string]: unknown;
}
export interface CatalogPassiveSkill {
  passive_skill_id: StableId;
  name_key: TextKey;
  description_key: TextKey | null;
  rank: number;
  is_negative: boolean;
  metadata: Metadata;
}
export interface CatalogActiveSkill {
  active_skill_id: StableId;
  name_key: TextKey;
  element_type: StableId;
  power: number | null;
  cooldown_seconds: number | null;
  metadata: Metadata;
}
export interface CatalogPalActiveSkill {
  pal_id: StableId;
  active_skill_id: StableId;
  learn_level: number;
  is_exclusive: boolean;
  metadata: Metadata;
}
export interface CatalogPartnerSkill {
  partner_skill_id: StableId;
  pal_id: StableId;
  name_key: TextKey;
  description_key: TextKey | null;
  metadata: Metadata;
}
export interface CatalogLocalization {
  locale: Locale;
  text_key: TextKey;
  text: string;
}
export interface CatalogBreedingRecipe {
  parent_a_pal_id: StableId;
  parent_b_pal_id: StableId;
  child_pal_id: StableId;
  recipe_type: "normal" | "special";
  metadata: Metadata;
}
export interface CatalogValidationReport {
  schema_version: SchemaVersion;
  content_hash: Sha256 | null;
  valid: boolean;
  errors: string[];
  warnings: string[];
  counts: CatalogCounts;
}
