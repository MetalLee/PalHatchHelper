import { saveConfig, type SyncConfig } from "./config.js";
import { sendHeartbeat, uploadSnapshot } from "./api.js";
import { buildUploadArtifacts } from "./pipeline.js";
import { bundledParserManifest } from "./parser.js";
import { createReadOnlySnapshot } from "./snapshot.js";

export async function syncOnce(
  config: SyncConfig,
): Promise<"uploaded" | "unchanged"> {
  const parserManifest = await bundledParserManifest();
  const snapshot = await createReadOnlySnapshot(config.save_dir);
  try {
    if (
      config.state?.last_save_hash === snapshot.hash &&
      config.state.last_parser_version === parserManifest.version
    ) {
      await sendHeartbeat(config.api_base_url, config.device_token, {
        app_version: config.app_version,
        status: "unchanged",
      });
      await updateState(
        config,
        snapshot.hash,
        parserManifest.version,
        "unchanged",
      );
      return "unchanged";
    }
    const artifacts = await buildUploadArtifacts(snapshot, {
      worldUid: config.world_uid,
      parserManifest,
    });
    await uploadSnapshot(
      config.api_base_url,
      config.device_token,
      artifacts.payload,
    );
    await updateState(
      config,
      snapshot.hash,
      parserManifest.version,
      "uploaded",
    );
    return "uploaded";
  } finally {
    await snapshot.cleanup();
  }
}

async function updateState(
  config: SyncConfig,
  hash: string,
  parserVersion: string,
  result: string,
): Promise<void> {
  config.state = {
    last_save_hash: hash,
    last_parser_version: parserVersion,
    last_result: result,
    last_sync_at: new Date().toISOString(),
  };
  await saveConfig(config);
}
