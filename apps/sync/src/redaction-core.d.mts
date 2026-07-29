import type {
  CanonicalSnapshot,
  InventoryPublishPayload,
} from "@palhatch/contracts";

export interface RedactionMetadata {
  sourceHash: string;
  sourceModifiedAt: string;
  parserVersion: string;
}

export function redactUidCore(rawUid: string): string;
export function createInventoryPublishPayload(
  snapshot: CanonicalSnapshot,
  metadata: RedactionMetadata,
): InventoryPublishPayload;
