import type {
  CanonicalSnapshot,
  InventoryPublishPayload,
} from "@palhatch/contracts";

import {
  bundledParserManifest,
  parseSnapshot,
  type ParserManifest,
} from "./parser.js";
import { toInventoryPublishPayload } from "./redaction.js";
import type { ReadOnlySnapshot } from "./snapshot.js";

export interface UploadArtifacts {
  canonical: CanonicalSnapshot;
  payload: InventoryPublishPayload;
}

export interface UploadArtifactOptions {
  worldUid: string;
  parserManifest?: ParserManifest;
}

export async function buildUploadArtifacts(
  snapshot: ReadOnlySnapshot,
  options: UploadArtifactOptions,
): Promise<UploadArtifacts> {
  const canonical = await parseSnapshot(snapshot.path, {
    worldUid: options.worldUid,
  });
  const parserManifest =
    options.parserManifest ?? (await bundledParserManifest());
  return {
    canonical,
    payload: toInventoryPublishPayload(canonical, {
      sourceHash: snapshot.hash,
      sourceModifiedAt: snapshot.sourceModifiedAt,
      parserVersion: parserManifest.version,
    }),
  };
}
