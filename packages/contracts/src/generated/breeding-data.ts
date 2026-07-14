/* Generated from breeding-data.schema.json. Do not edit directly. */

export type BreedingSourceVersion = string;
export type BreedingStableId = string;
export type BreedingRecipeType = "normal" | "special";
export type BreedingSha256 = string;

export interface BreedingRecipeSourceDocumentContracts {
  BreedingRecipeSourceDocument: BreedingRecipeSourceDocument;
  BreedingRecipeSourceRecord: BreedingRecipeSourceRecord;
  StagedBreedingSourceMetadata: StagedBreedingSourceMetadata;
  BreedingDataValidationIssue: BreedingDataValidationIssue;
  BreedingDataValidationCounts: BreedingDataValidationCounts;
  BreedingDataValidationReport: BreedingDataValidationReport;
  BreedingRecipeSnapshot: BreedingRecipeSnapshot;
  BreedingRecipeChange: BreedingRecipeChange;
  BreedingDataDiffCounts: BreedingDataDiffCounts;
  BreedingDataDiffReport: BreedingDataDiffReport;
}
/**
 * Source and report contracts for the versioned breeding data supply chain.
 */
export interface BreedingRecipeSourceDocument {
  source_version: BreedingSourceVersion;
  recipes: BreedingRecipeSourceRecord[];
}
export interface BreedingRecipeSourceRecord {
  /**
   * @minItems 2
   * @maxItems 2
   */
  parents: [BreedingStableId, BreedingStableId];
  child_pal_id: BreedingStableId;
  recipe_type: BreedingRecipeType;
  metadata: BreedingMetadata;
}
export interface BreedingMetadata {
  [k: string]: unknown;
}
export interface StagedBreedingSourceMetadata {
  source_type: "github" | "url" | "upload";
  source_name: string;
  source_version: BreedingSourceVersion;
  filename: string;
  raw_content_hash: BreedingSha256;
  fetched_at: string;
}
export interface BreedingDataValidationIssue {
  code: string;
  record_indexes: number[];
}
export interface BreedingDataValidationCounts {
  input_records: number;
  normalized_records: number;
  normal_recipes: number;
  special_recipes: number;
  special_overrides: number;
}
export interface BreedingDataValidationReport {
  schema_version: "1.0.0";
  raw_content_hash: BreedingSha256;
  source_version: BreedingSourceVersion;
  valid: boolean;
  errors: BreedingDataValidationIssue[];
  warnings: BreedingDataValidationIssue[];
  counts: BreedingDataValidationCounts;
}
export interface BreedingRecipeSnapshot {
  parent_a_pal_id: BreedingStableId;
  parent_b_pal_id: BreedingStableId;
  child_pal_id: BreedingStableId;
  recipe_type: BreedingRecipeType;
  metadata: BreedingMetadata;
}
export interface BreedingRecipeChange {
  parent_a_pal_id: BreedingStableId;
  parent_b_pal_id: BreedingStableId;
  recipe_type: BreedingRecipeType;
  before_child_pal_id: BreedingStableId;
  after_child_pal_id: BreedingStableId;
  metadata_changed: boolean;
}
export interface BreedingDataDiffCounts {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}
export interface BreedingDataDiffReport {
  schema_version: "1.0.0";
  from_content_hash: BreedingSha256;
  to_content_hash: BreedingSha256;
  added: BreedingRecipeSnapshot[];
  removed: BreedingRecipeSnapshot[];
  changed: BreedingRecipeChange[];
  counts: BreedingDataDiffCounts;
}
