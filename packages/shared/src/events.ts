/**
 * Realtime event contract (SPEC 11.5, 13.2).
 *
 * Every client-to-server payload has a zod schema; the gateway validates before
 * doing anything else. Note what is deliberately absent from these schemas:
 * `instanceId`, seat ownership and voice permission are never accepted from the
 * client — the server derives them from the session (SPEC 11.5, 13.2, 14.1).
 */

import { z } from 'zod';
import { DIRECTIONS } from './iso';
import {
  ChatMessage,
  NpcPresence,
  PlayerPresence,
  PlayerStatus,
  PLAYER_STATUSES,
  SeatOccupancy,
  VoiceState,
  WorldSnapshot,
} from './types';

export const CLIENT_EVENTS = {
  worldJoin: 'world:join',
  worldLeave: 'world:leave',
  playerMove: 'player:move',
  playerState: 'player:state',
  playerSit: 'player:sit',
  playerStand: 'player:stand',
  voiceJoin: 'voice:join',
  voiceLeave: 'voice:leave',
  voiceState: 'voice:state',
  chatSend: 'chat:send',
  ping: 'session:ping',
} as const;

export const SERVER_EVENTS = {
  worldSnapshot: 'world:snapshot',
  playerJoined: 'player:joined',
  playerLeft: 'player:left',
  worldDelta: 'world:delta',
  playerState: 'player:state',
  playerCorrection: 'player:correction',
  seatOccupied: 'seat:occupied',
  seatReleased: 'seat:released',
  voiceState: 'voice:state',
  voiceGroup: 'voice:group',
  chatReceived: 'chat:received',
  systemError: 'system:error',
  pong: 'session:pong',
} as const;

const directionSchema = z.enum(DIRECTIONS as [string, ...string[]]);

export const worldJoinSchema = z.object({});

export const playerMoveSchema = z.object({
  sequence: z.number().int().nonnegative(),
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(1000),
  direction: directionSchema,
});

export const playerStateSchema = z.object({
  status: z.enum(PLAYER_STATUSES as unknown as [PlayerStatus, ...PlayerStatus[]]),
});

export const playerSitSchema = z.object({
  seatId: z.string().min(1).max(64),
});

export const playerStandSchema = z.object({});

export const voiceJoinSchema = z.object({
  /**
   * Optional: when omitted the server uses the seat the player is sitting on.
   * A supplied id is still checked against the seat the server knows about.
   */
  groupId: z.string().min(1).max(64).optional(),
});

export const voiceLeaveSchema = z.object({});

export const voiceStateSchema = z.object({
  micOn: z.boolean(),
  connected: z.boolean().optional(),
});

export const chatSendSchema = z.object({
  body: z.string().trim().min(1).max(280),
});

export type PlayerMovePayload = z.infer<typeof playerMoveSchema>;
export type PlayerStatePayload = z.infer<typeof playerStateSchema>;
export type PlayerSitPayload = z.infer<typeof playerSitSchema>;
export type VoiceJoinPayload = z.infer<typeof voiceJoinSchema>;
export type VoiceStatePayload = z.infer<typeof voiceStateSchema>;
export type ChatSendPayload = z.infer<typeof chatSendSchema>;

export interface PlayerMovedEvent {
  userId: string;
  x: number;
  y: number;
  direction: string;
}

/**
 * One tick's worth of position changes, batched into a single frame.
 *
 * Only players who actually moved since the previous tick are included, and
 * each entry carries the server's *current* authoritative position rather than
 * a queued one — so a seat snap can never be overwritten by a stale walk
 * update that was already in flight.
 */
export interface WorldDeltaEvent {
  players: PlayerMovedEvent[];
}

export interface PlayerCorrectionEvent {
  sequence: number;
  x: number;
  y: number;
  reason: 'collision' | 'speed' | 'seated' | 'bounds';
}

export interface PlayerStateEvent {
  userId: string;
  status: PlayerStatus;
  seatId: string | null;
  voice: VoiceState;
}

export interface VoiceGroupEvent {
  groupId: string | null;
  members: string[];
}

export interface SystemErrorEvent {
  event: string;
  code: 'invalid_payload' | 'rate_limited' | 'forbidden' | 'not_found' | 'conflict';
  message: string;
}

export interface ServerToClientEvents {
  'world:snapshot': (snapshot: WorldSnapshot) => void;
  'player:joined': (player: PlayerPresence) => void;
  'player:left': (payload: { userId: string }) => void;
  'world:delta': (payload: WorldDeltaEvent) => void;
  'player:state': (payload: PlayerStateEvent) => void;
  'player:correction': (payload: PlayerCorrectionEvent) => void;
  'seat:occupied': (payload: SeatOccupancy) => void;
  'seat:released': (payload: SeatOccupancy) => void;
  'voice:state': (payload: { userId: string; voice: VoiceState }) => void;
  'voice:group': (payload: VoiceGroupEvent) => void;
  'chat:received': (message: ChatMessage) => void;
  'system:error': (payload: SystemErrorEvent) => void;
  'session:pong': (payload: { serverTime: number }) => void;
}

export type NpcUpdate = Pick<NpcPresence, 'npcId' | 'x' | 'y' | 'direction' | 'activity'>;
