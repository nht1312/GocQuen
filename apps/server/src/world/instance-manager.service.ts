import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  AVATAR_RADIUS,
  AvatarConfig,
  MAP_VERSION,
  NPCS,
  PlayerMovePayload,
  PlayerPresence,
  PlayerStatus,
  SEATS_BY_ID,
  SEAT_INTERACT_RADIUS,
  SPAWN_POINT,
  SPAWN_SPREAD,
  SeatDefinition,
  SPEED_TOLERANCE,
  WALK_SPEED,
  WorldSnapshot,
  isWalkable,
  seatAnchor,
  userSeats,
} from '@virtual-cafe/shared';
import { AppConfig } from '../config/app-config';

export const WORLD_ID = 'cafe-main';

export interface PlayerRuntime {
  presence: PlayerPresence;
  instanceId: string;
  socketId: string | null;
  /** Server time of the last accepted movement, used for speed validation. */
  lastMoveAt: number;
  lastSequence: number;
  /** Status to restore when the player leaves a conversation. */
  statusBeforeVoice: PlayerStatus | null;
  graceTimer: NodeJS.Timeout | null;
}

export interface CafeInstance {
  id: string;
  worldId: string;
  createdAt: number;
  players: Map<string, PlayerRuntime>;
  /** seatId -> userId. Single source of truth for occupancy (SPEC 5.3). */
  seats: Map<string, string>;
}

export type RejectReason = 'collision' | 'speed' | 'seated' | 'bounds';

export type MoveResult =
  | { ok: true; presence: PlayerPresence }
  | { ok: false; reason: RejectReason; x: number; y: number };

export type SeatResult =
  | { ok: true; presence: PlayerPresence; seat: SeatDefinition; releasedSeatId: string | null }
  | { ok: false; code: 'not_found' | 'conflict' | 'forbidden'; message: string };

export type VoiceResult =
  | { ok: true; presence: PlayerPresence; groupId: string; members: string[] }
  | { ok: false; code: 'forbidden' | 'not_found'; message: string };

export interface JoinOutcome {
  instance: CafeInstance;
  player: PlayerRuntime;
  reconnected: boolean;
}

interface ManagerEvents {
  /** Emitted when a disconnected player's grace period runs out. */
  'player-expired': (payload: { instanceId: string; userId: string; seatId: string | null }) => void;
}

/**
 * The authoritative café (SPEC 11.3, 11.4).
 *
 * Node runs this single-threaded, which is what makes seat claims atomic: the
 * check and the write in `sit()` cannot be interleaved, so two people racing
 * for the last chair always produce exactly one winner.
 *
 * Scope note: this holds instance state in process memory, which is correct for
 * one realtime node. Running several nodes needs a shared registry (Redis) for
 * occupancy and seat locks — the seam is this class, nothing outside it reads
 * the maps directly.
 */
@Injectable()
export class InstanceManager {
  private readonly logger = new Logger(InstanceManager.name);
  private readonly emitter = new EventEmitter();
  private readonly instances = new Map<string, CafeInstance>();
  /** userId -> instanceId, so reconnects find their way home. */
  private readonly playerIndex = new Map<string, string>();

  constructor(private readonly config: AppConfig) {}

  on<E extends keyof ManagerEvents>(event: E, listener: ManagerEvents[E]): void {
    this.emitter.on(event, listener);
  }

  // ---------------------------------------------------------------- instances

  get capacity(): number {
    return this.config.instanceCapacity;
  }

  listInstances(): CafeInstance[] {
    return [...this.instances.values()];
  }

  getInstance(instanceId: string): CafeInstance | undefined {
    return this.instances.get(instanceId);
  }

  findInstanceOf(userId: string): CafeInstance | undefined {
    const instanceId = this.playerIndex.get(userId);
    return instanceId ? this.instances.get(instanceId) : undefined;
  }

  getPlayer(userId: string): PlayerRuntime | undefined {
    return this.findInstanceOf(userId)?.players.get(userId);
  }

  totalOnline(): number {
    let total = 0;
    for (const instance of this.instances.values()) total += instance.players.size;
    return total;
  }

  /**
   * Pick the fullest instance that still has room, so people meet each other
   * rather than being scattered one-per-room (SPEC 11.3).
   */
  assignInstance(): CafeInstance {
    let best: CafeInstance | null = null;
    for (const instance of this.instances.values()) {
      if (instance.players.size >= this.capacity) continue;
      if (!best || instance.players.size > best.players.size) best = instance;
    }
    if (best) return best;
    const instance: CafeInstance = {
      id: randomUUID(),
      worldId: WORLD_ID,
      createdAt: Date.now(),
      players: new Map(),
      seats: new Map(),
    };
    this.instances.set(instance.id, instance);
    this.logger.log(`Opened instance ${instance.id} (capacity ${this.capacity})`);
    return instance;
  }

  // ------------------------------------------------------------------- joining

  private spawnPosition(instance: CafeInstance): { x: number; y: number } {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = SPAWN_POINT.x + (Math.random() - 0.5) * SPAWN_SPREAD * 2;
      const y = SPAWN_POINT.y + (Math.random() - 0.5) * SPAWN_SPREAD * 2;
      if (!isWalkable(x, y, AVATAR_RADIUS)) continue;
      const crowded = [...instance.players.values()].some(
        (other) => Math.hypot(other.presence.x - x, other.presence.y - y) < 0.5,
      );
      if (!crowded) return { x, y };
    }
    return { x: SPAWN_POINT.x, y: SPAWN_POINT.y };
  }

  join(
    user: { id: string; displayName: string; avatar: AvatarConfig },
    socketId: string,
  ): JoinOutcome {
    const existingInstance = this.findInstanceOf(user.id);
    const existing = existingInstance?.players.get(user.id);
    if (existingInstance && existing) {
      // Reconnect inside the grace window: the avatar and seat were held.
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
      }
      existing.socketId = socketId;
      existing.lastMoveAt = Date.now();
      existing.presence.displayName = user.displayName;
      existing.presence.avatar = user.avatar;
      // Never resume a live microphone across a reconnect (SPEC 17.3).
      existing.presence.voice = { groupId: null, micOn: false, connected: false };
      existing.presence.updatedAt = Date.now();
      return { instance: existingInstance, player: existing, reconnected: true };
    }

    const instance = this.assignInstance();
    const spawn = this.spawnPosition(instance);
    const player: PlayerRuntime = {
      instanceId: instance.id,
      socketId,
      lastMoveAt: Date.now(),
      lastSequence: -1,
      statusBeforeVoice: null,
      graceTimer: null,
      presence: {
        userId: user.id,
        displayName: user.displayName,
        avatar: user.avatar,
        x: spawn.x,
        y: spawn.y,
        direction: 'south_east',
        status: 'available',
        seatId: null,
        voice: { groupId: null, micOn: false, connected: false },
        updatedAt: Date.now(),
      },
    };
    instance.players.set(user.id, player);
    this.playerIndex.set(user.id, instance.id);
    return { instance, player, reconnected: false };
  }

  /** Socket dropped: hold the avatar and seat for the grace period (SPEC 5.3, 16.2). */
  detach(userId: string): void {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return;
    player.socketId = null;
    player.presence.voice = { groupId: null, micOn: false, connected: false };
    player.presence.status = 'away';
    player.presence.updatedAt = Date.now();
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = setTimeout(() => {
      const seatId = player.presence.seatId;
      this.remove(userId);
      this.emitter.emit('player-expired', { instanceId: instance.id, userId, seatId });
    }, this.config.disconnectGraceSeconds * 1000);
    // Do not keep the process alive just to expire a ghost.
    player.graceTimer.unref?.();
  }

  /** Remove immediately: explicit leave, or the grace period expiring. */
  remove(userId: string): { instanceId: string; seatId: string | null } | null {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return null;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    const seatId = player.presence.seatId;
    if (seatId && instance.seats.get(seatId) === userId) instance.seats.delete(seatId);
    instance.players.delete(userId);
    this.playerIndex.delete(userId);
    if (instance.players.size === 0) {
      this.instances.delete(instance.id);
      this.logger.log(`Closed empty instance ${instance.id}`);
    }
    return { instanceId: instance.id, seatId };
  }

  // ------------------------------------------------------------------ movement

  move(userId: string, payload: PlayerMovePayload): MoveResult {
    const player = this.getPlayer(userId);
    if (!player) return { ok: false, reason: 'bounds', x: 0, y: 0 };
    const { presence } = player;

    if (presence.seatId) {
      return { ok: false, reason: 'seated', x: presence.x, y: presence.y };
    }
    // Stale or duplicated packets are dropped, not corrected.
    if (payload.sequence <= player.lastSequence) {
      return { ok: true, presence };
    }

    const now = Date.now();
    const elapsedSeconds = Math.min(Math.max((now - player.lastMoveAt) / 1000, 0.016), 1);
    const budget = (WALK_SPEED + SPEED_TOLERANCE) * elapsedSeconds;
    const travelled = Math.hypot(payload.x - presence.x, payload.y - presence.y);
    if (travelled > budget) {
      return { ok: false, reason: 'speed', x: presence.x, y: presence.y };
    }
    if (!isWalkable(payload.x, payload.y, AVATAR_RADIUS)) {
      return { ok: false, reason: 'collision', x: presence.x, y: presence.y };
    }

    player.lastSequence = payload.sequence;
    player.lastMoveAt = now;
    presence.x = payload.x;
    presence.y = payload.y;
    presence.direction = payload.direction as PlayerPresence['direction'];
    presence.updatedAt = now;
    return { ok: true, presence };
  }

  setStatus(userId: string, status: PlayerStatus): PlayerPresence | null {
    const player = this.getPlayer(userId);
    if (!player) return null;
    // `in_conversation` is derived from voice membership, never self-assigned.
    if (status === 'in_conversation') return player.presence;
    if (player.presence.voice.groupId) {
      player.statusBeforeVoice = status;
      return player.presence;
    }
    player.presence.status = status;
    player.presence.updatedAt = Date.now();
    return player.presence;
  }

  // ---------------------------------------------------------------------- seats

  sit(userId: string, seatId: string): SeatResult {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) {
      return { ok: false, code: 'forbidden', message: 'Bạn chưa ở trong quán' };
    }
    const seat = SEATS_BY_ID.get(seatId);
    if (!seat) return { ok: false, code: 'not_found', message: 'Không tìm thấy chỗ ngồi này' };
    if (seat.npcOnly) {
      return { ok: false, code: 'forbidden', message: 'Chỗ ngồi này chỉ là một phần của khung cảnh' };
    }

    const occupant = instance.seats.get(seatId);
    if (occupant && occupant !== userId) {
      return { ok: false, code: 'conflict', message: 'Đã có người ngồi ở đó rồi' };
    }

    const anchor = seatAnchor(seat);
    const reach = Math.hypot(anchor.x - player.presence.x, anchor.y - player.presence.y);
    if (reach > SEAT_INTERACT_RADIUS) {
      return { ok: false, code: 'forbidden', message: 'Hãy đi lại gần chỗ ngồi hơn' };
    }

    const releasedSeatId = player.presence.seatId;
    if (releasedSeatId && releasedSeatId !== seatId) {
      if (instance.seats.get(releasedSeatId) === userId) instance.seats.delete(releasedSeatId);
      // Changing table means leaving the old conversation (SPEC 6.2).
      this.clearVoice(player);
    }

    instance.seats.set(seatId, userId);
    player.presence.seatId = seatId;
    player.presence.x = anchor.x;
    player.presence.y = anchor.y;
    player.presence.direction = seat.facing;
    player.presence.updatedAt = Date.now();
    return { ok: true, presence: player.presence, seat, releasedSeatId };
  }

  stand(userId: string): { presence: PlayerPresence; releasedSeatId: string | null } | null {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return null;
    const releasedSeatId = player.presence.seatId;
    if (releasedSeatId && instance.seats.get(releasedSeatId) === userId) {
      instance.seats.delete(releasedSeatId);
    }
    this.clearVoice(player);
    player.presence.seatId = null;
    player.presence.updatedAt = Date.now();
    return { presence: player.presence, releasedSeatId };
  }

  seatOccupancy(instance: CafeInstance): Array<{ seatId: string; userId: string | null }> {
    return userSeats().map((seat) => ({
      seatId: seat.seatId,
      userId: instance.seats.get(seat.seatId) ?? null,
    }));
  }

  // ---------------------------------------------------------------------- voice

  /**
   * Voice groups are table-scoped and server-granted (SPEC 6.2, 14.1). A client
   * may name a group, but it only ever gets the one its seat belongs to.
   */
  voiceJoin(userId: string, requestedGroupId?: string): VoiceResult {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) {
      return { ok: false, code: 'forbidden', message: 'Bạn chưa ở trong quán' };
    }
    if (!player.presence.seatId) {
      return { ok: false, code: 'forbidden', message: 'Hãy ngồi vào bàn để trò chuyện' };
    }
    const seat = SEATS_BY_ID.get(player.presence.seatId);
    if (!seat) return { ok: false, code: 'not_found', message: 'Không tìm thấy chỗ ngồi này' };
    if (requestedGroupId && requestedGroupId !== seat.seatGroupId) {
      return { ok: false, code: 'forbidden', message: 'Cuộc trò chuyện đó không ở bàn của bạn' };
    }

    if (player.presence.voice.groupId !== seat.seatGroupId) {
      player.statusBeforeVoice = player.presence.status;
    }
    // Joining the group never turns the microphone on (SPEC 6.2, 14.2).
    player.presence.voice = { groupId: seat.seatGroupId, micOn: false, connected: true };
    player.presence.status = 'in_conversation';
    player.presence.updatedAt = Date.now();

    return {
      ok: true,
      presence: player.presence,
      groupId: seat.seatGroupId,
      members: this.groupMembers(instance, seat.seatGroupId),
    };
  }

  voiceLeave(userId: string): { presence: PlayerPresence; groupId: string | null; members: string[] } | null {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return null;
    const groupId = player.presence.voice.groupId;
    this.clearVoice(player);
    return {
      presence: player.presence,
      groupId,
      members: groupId ? this.groupMembers(instance, groupId) : [],
    };
  }

  setVoiceState(userId: string, micOn: boolean, connected?: boolean): PlayerPresence | null {
    const player = this.getPlayer(userId);
    if (!player) return null;
    if (!player.presence.voice.groupId) {
      // No group, no microphone. Refuse rather than silently publish.
      player.presence.voice = { groupId: null, micOn: false, connected: false };
      return player.presence;
    }
    player.presence.voice = {
      ...player.presence.voice,
      micOn,
      connected: connected ?? player.presence.voice.connected,
    };
    player.presence.updatedAt = Date.now();
    return player.presence;
  }

  /** Everyone currently admitted to a conversation group, by user id. */
  groupMembers(instance: CafeInstance, groupId: string): string[] {
    const members: string[] = [];
    for (const player of instance.players.values()) {
      if (player.presence.voice.groupId === groupId) members.push(player.presence.userId);
    }
    return members;
  }

  /** Who may receive a message or voice stream scoped to this player's table. */
  tableMembers(instance: CafeInstance, seatGroupId: string): string[] {
    const members: string[] = [];
    for (const player of instance.players.values()) {
      const seatId = player.presence.seatId;
      if (!seatId) continue;
      if (SEATS_BY_ID.get(seatId)?.seatGroupId === seatGroupId) members.push(player.presence.userId);
    }
    return members;
  }

  private clearVoice(player: PlayerRuntime): void {
    if (!player.presence.voice.groupId && player.presence.status !== 'in_conversation') return;
    player.presence.voice = { groupId: null, micOn: false, connected: false };
    if (player.presence.status === 'in_conversation') {
      player.presence.status = player.statusBeforeVoice ?? 'available';
    }
    player.statusBeforeVoice = null;
    player.presence.updatedAt = Date.now();
  }

  // ------------------------------------------------------------------ snapshots

  snapshotFor(userId: string): WorldSnapshot | null {
    const instance = this.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return null;
    return {
      instanceId: instance.id,
      worldId: instance.worldId,
      mapVersion: MAP_VERSION,
      serverTime: Date.now(),
      self: player.presence,
      players: [...instance.players.values()]
        .filter((other) => other.presence.userId !== userId)
        .map((other) => other.presence),
      npcs: NPCS,
      seats: this.seatOccupancy(instance),
      capacity: this.capacity,
      voiceAvailable: this.config.voiceAvailable,
    };
  }

  stats() {
    const instances = this.listInstances();
    return {
      instanceCount: instances.length,
      onlineCount: this.totalOnline(),
      seatedCount: instances.reduce((total, instance) => total + instance.seats.size, 0),
      occupancy: instances.map((instance) => ({
        instanceId: instance.id,
        players: instance.players.size,
        seats: instance.seats.size,
      })),
    };
  }
}
