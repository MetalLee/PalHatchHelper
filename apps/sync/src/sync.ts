import { saveConfig, type SyncConfig } from "./config.js";
import { sendHeartbeat, uploadSnapshot } from "./api.js";
import { buildUploadArtifacts } from "./pipeline.js";
import { createReadOnlySnapshot } from "./snapshot.js";

export async function syncOnce(
  config: SyncConfig,
): Promise<"uploaded" | "unchanged"> {
  const snapshot = await createReadOnlySnapshot(config.save_dir);
  try {
    if (config.state?.last_save_hash === snapshot.hash) {
      await sendHeartbeat(config.api_base_url, config.device_token, {
        app_version: config.app_version,
        status: "unchanged",
      });
      await updateState(config, snapshot.hash, "unchanged");
      return "unchanged";
    }
    const artifacts = await buildUploadArtifacts(snapshot);
    await uploadSnapshot(
      config.api_base_url,
      config.device_token,
      artifacts.payload,
    );
    await updateState(config, snapshot.hash, "uploaded");
    return "uploaded";
  } finally {
    await snapshot.cleanup();
  }
}

async function updateState(
  config: SyncConfig,
  hash: string,
  result: string,
): Promise<void> {
  config.state = {
    last_save_hash: hash,
    last_result: result,
    last_sync_at: new Date().toISOString(),
  };
  await saveConfig(config);
}
