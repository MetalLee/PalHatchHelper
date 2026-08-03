/* Generated from sync-api.schema.json. Do not edit directly. */

export interface SyncApiContractsContracts {
  SyncPairRequest: SyncPairRequest;
  SyncPairResponse: SyncPairResponse;
  SyncHeartbeatRequest: SyncHeartbeatRequest;
  SyncPairingCodeResponse: SyncPairingCodeResponse;
  SyncDevice: SyncDevice;
  SyncServerMember: SyncServerMember;
  SyncClaimablePlayer: SyncClaimablePlayer;
  SyncBindingInvitationCreated: SyncBindingInvitationCreated;
  SyncBindingInvitationPreview: SyncBindingInvitationPreview;
  SyncBindingInvitationAccepted: SyncBindingInvitationAccepted;
}
export interface SyncPairRequest {
  code: string;
  device_name: string;
  platform: "linux-x64" | "win32-x64";
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
  members: SyncServerMember[];
}
export interface SyncServerMember {
  player_id: string;
  nickname: string;
  level: number | null;
  guild_name: string | null;
  world_name: string;
  discriminator: string;
  is_bound: boolean;
  is_current_user: boolean;
}
export interface SyncClaimablePlayer {
  player_id: string;
  nickname: string;
  level: number | null;
  guild_name: string | null;
  world_name: string;
  discriminator: string;
}
export interface SyncBindingInvitationCreated {
  invitation_path: string;
  expires_at: string;
}
export interface SyncBindingInvitationPreview {
  player_id: string;
  nickname: string;
  level: number | null;
  guild_name: string | null;
  world_name: string;
  device_name: string;
  discriminator: string;
  expires_at: string;
}
export interface SyncBindingInvitationAccepted {
  player_id: string;
}
