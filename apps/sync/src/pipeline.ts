import type {
  CanonicalSnapshot,
  InventoryPublishPayload,
} from "@palhatch/contracts";

import { bundledParserManifest, parseSnapshot } from "./parser.js";
import { toInventoryPublishPayload } from "./redaction.js";
import type { ReadOnlySnapshot } from "./snapshot.js";

export interface UploadArtifacts {
  canonical: CanonicalSnapshot;
  payload: InventoryPublishPayload;
}

export async function buildUploadArtifacts(
  snapshot: ReadOnlySnapshot,
): Promise<UploadArtifacts> {
  const canonical = await parseSnapshot(snapshot.path);
  const parserManifest = await bundledParserManifest();
  return {
    canonical,
    payload: toInventoryPublishPayload(canonical, {
      sourceHash: snapshot.hash,
      sourceModifiedAt: snapshot.sourceModifiedAt,
      parserVersion: parserManifest.version,
    }),
  };
}
