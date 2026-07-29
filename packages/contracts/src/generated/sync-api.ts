/* Generated from sync-api.schema.json. Do not edit directly. */

export interface SyncApiContractsContracts {
  SyncPairRequest: SyncPairRequest;
  SyncPairResponse: SyncPairResponse;
  SyncHeartbeatRequest: SyncHeartbeatRequest;
  SyncPairingCodeResponse: SyncPairingCodeResponse;
  SyncDevice: SyncDevice;
  SyncClaimablePlayer: SyncClaimablePlayer;
}
export interface SyncPairRequest {
  code: string;
  device_name: string;
  platform: "linux-x64";
  app_version?: string | null;
}
export interface SyncPairResponse {
  device_id: string;
  device_token: string;
  api_base_url: string;
}
export interface SyncHeartbeatRequest {
  app_version?: string | null;
  status?: "ok" | "unchanged" | "idle" | "error";
}
export interface SyncPairingCodeResponse {
  code: string;
  expires_at: string;
}
export interface SyncDevice {
  id: string;
  name: string;
  platform: string;
  token_prefix: string;
  app_version: string | null;
  world_id: string | null;
  last_seen_at: string | null;
  last_snapshot_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
export interface SyncClaimablePlayer {
  player_id: string;
  nickname: string;
  level: number | null;
  guild_name: string | null;
  world_name: string;
  discriminator: string;
}
