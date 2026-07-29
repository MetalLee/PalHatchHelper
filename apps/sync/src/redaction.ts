import {
  parseInventoryPublishPayload,
  type CanonicalSnapshot,
  type InventoryPublishPayload,
} from "@palhatch/contracts";

import {
  createInventoryPublishPayload,
  redactUidCore,
} from "./redaction-core.mjs";

interface PublishMetadata {
  sourceHash: string;
  sourceModifiedAt: string;
  parserVersion: string;
}

export function redactUid(rawUid: string): string {
  return redactUidCore(rawUid);
}

export function toInventoryPublishPayload(
  snapshot: CanonicalSnapshot,
  metadata: PublishMetadata,
): InventoryPublishPayload {
  return parseInventoryPublishPayload(
    createInventoryPublishPayload(snapshot, metadata),
  );
}
