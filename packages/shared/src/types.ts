import { Direction } from './iso';

/** SPEC 7.2 — user status. `in_conversation` is derived from voice membership. */
export const PLAYER_STATUSES = ['available', 'working', 'focus', 'away', 'in_conversation'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

/** Nhãn hiển thị cho người dùng (tiếng Việt). Khoá vẫn là mã máy. */
export const STATUS_LABELS: Record<PlayerStatus, string> = {
  available: 'Đang rảnh',
  working: 'Đang làm việc',
  focus: 'Cần tập trung',
  away: 'Đang vắng mặt',
  in_conversation: 'Đang trò chuyện',
};

/** The seven avatar presets available without a customisation system (SPEC 7.1). */
export const AVATAR_PRESETS = [
  { id: 'clay', skin: '#e8c3a0', hair: '#3a2a24', top: '#8c6b4f', accent: '#c58b5a' },
  { id: 'olive', skin: '#d9a97f', hair: '#1f1a17', top: '#6b7355', accent: '#9aa57c' },
  { id: 'rose', skin: '#f0d2bd', hair: '#6b3f2a', top: '#b5706b', accent: '#d99a8f' },
  { id: 'slate', skin: '#c99670', hair: '#2b2b33', top: '#5a6475', accent: '#8893a6' },
  { id: 'cream', skin: '#f2dcc6', hair: '#a9743f', top: '#d8c3a0', accent: '#b8956a' },
  { id: 'cocoa', skin: '#9a6a4b', hair: '#161210', top: '#4f4038', accent: '#7d6552' },
  { id: 'sage', skin: '#e3bb96', hair: '#4d3b2f', top: '#7f9080', accent: '#a9bda6' },
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]['id'];

export interface AvatarConfig {
  presetId: AvatarPresetId;
}

export interface VoiceState {
  /** Conversation group the player is admitted to, normally the table id. */
  groupId: string | null;
  /** Whether the player has actually published audio (mic on). */
  micOn: boolean;
  /** Whether the player is currently connected to the voice room. */
  connected: boolean;
}

/** SPEC 7.3 — everything realtime clients need about another person. */
export interface PlayerPresence {
  userId: string;
  displayName: string;
  avatar: AvatarConfig;
  x: number;
  y: number;
  direction: Direction;
  status: PlayerStatus;
  seatId: string | null;
  voice: VoiceState;
  isNpc?: false;
  /** Server clock when the presence record was last touched. */
  updatedAt: number;
}

export type NpcActivity = 'barista' | 'reading' | 'laptop' | 'chatting';

export interface NpcPresence {
  npcId: string;
  displayName: string;
  avatar: AvatarConfig;
  x: number;
  y: number;
  direction: Direction;
  activity: NpcActivity;
  seatId: string | null;
  /** Always true: the UI must mark NPCs clearly (SPEC 8.2). */
  isNpc: true;
}

export interface SeatOccupancy {
  seatId: string;
  userId: string | null;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  userId: string;
  displayName: string;
  body: string;
  sentAt: number;
}

export interface WorldSnapshot {
  instanceId: string;
  worldId: string;
  mapVersion: number;
  serverTime: number;
  self: PlayerPresence;
  players: PlayerPresence[];
  npcs: NpcPresence[];
  seats: SeatOccupancy[];
  capacity: number;
  /** Null when no SFU is configured — the café still works without voice. */
  voiceAvailable: boolean;
}

export interface GuestSession {
  token: string;
  userId: string;
  displayName: string;
  avatar: AvatarConfig;
  expiresAt: number;
}

export interface CafeInfo {
  worldId: string;
  name: string;
  mapVersion: number;
  onlineCount: number;
  instanceCount: number;
  capacityPerInstance: number;
  voiceAvailable: boolean;
}

export interface JoinResult {
  instanceId: string;
  realtimeUrl: string;
  capacity: number;
  voiceAvailable: boolean;
}

export interface VoiceTokenResult {
  available: boolean;
  /** Null when voice is not configured or the player is not in a group. */
  token: string | null;
  url: string | null;
  room: string | null;
  identity: string;
  groupId: string | null;
  expiresAt: number | null;
  reason?: string;
}

export const MODERATION_REASONS = [
  'harassment',
  'hate_speech',
  'spam',
  'inappropriate_audio',
  'other',
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

/** Nhãn tiếng Việt cho lý do báo cáo; mã gửi lên máy chủ không đổi. */
export const MODERATION_REASON_LABELS: Record<ModerationReason, string> = {
  harassment: 'Quấy rối',
  hate_speech: 'Ngôn từ thù ghét',
  spam: 'Spam',
  inappropriate_audio: 'Âm thanh không phù hợp',
  other: 'Lý do khác',
};
