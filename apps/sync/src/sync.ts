import { saveConfig, type SyncConfig } from "./config.js";
import { sendHeartbeat, uploadSnapshot } from "./api.js";
import { bundledParserManifest, parseSnapshot } from "./parser.js";
import { toInventoryPublishPayload } from "./redaction.js";
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
      await updateState(config, snapshot.hash, "存档未变化，已发送心跳");
      return "unchanged";
    }
    const canonical = await parseSnapshot(snapshot.path);
    const parserManifest = await bundledParserManifest();
    const payload = toInventoryPublishPayload(canonical, {
      sourceHash: snapshot.hash,
      sourceModifiedAt: snapshot.sourceModifiedAt,
      parserVersion: parserManifest.version,
    });
    await uploadSnapshot(config.api_base_url, config.device_token, payload);
    await updateState(config, snapshot.hash, "上传成功");
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
