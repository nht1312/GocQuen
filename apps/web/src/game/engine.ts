import {
  AVATAR_RADIUS,
  CLIENT_EVENTS,
  ChatMessage,
  Direction,
  MOVE_SEND_HZ,
  NpcPresence,
  PlayerPresence,
  SEATS_BY_ID,
  SEAT_DEFINITIONS,
  SEAT_INTERACT_RADIUS,
  SERVER_EVENTS,
  SeatDefinition,
  WALK_SPEED,
  WorldDeltaEvent,
  WorldSnapshot,
  isWalkable,
  seatAnchor,
  vectorToDirection,
} from '@virtual-cafe/shared';
import type { Socket } from 'socket.io-client';
import { AvatarRenderState } from './avatar';
import { SceneInput } from './renderer';
import { joystickToWorld } from './touchInput';

/** How far into the sofa (towards the backrest) a seated avatar is drawn. */
const SOFA_CUSHION_OFFSET = 0.55;

/** The four screen-space directions a key can hold down. */
export type MoveAxis = 'up' | 'down' | 'left' | 'right';

export type InputState = Record<MoveAxis, boolean> & {
  /**
   * Analog screen-space push from a touch joystick: x towards the right of
   * the screen, y towards the bottom, magnitude 0..1. Present only while a
   * thumb is on the stick, and it then takes precedence over the keys — a
   * thumb can walk slowly and in any direction, not only the eight a keyboard
   * can spell.
   */
  vector?: { x: number; y: number } | null;
};

interface Entity {
  id: string;
  displayName: string;
  presetId: string;
  x: number;
  y: number;
  /** Last position the server told us about; remote entities ease towards it. */
  targetX: number;
  targetY: number;
  direction: Direction;
  seated: boolean;
  status: PlayerPresence['status'];
  micOn: boolean;
  inVoiceGroup: boolean;
  isNpc: boolean;
  phase: number;
  moving: boolean;
}

export interface EngineCallbacks {
  onPresenceTick: (payload: {
    self: { x: number; y: number; seatId: string | null };
    nearbySeatId: string | null;
  }) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onPlayerJoined: (player: PlayerPresence) => void;
  onPlayerLeft: (userId: string) => void;
  onPlayerState: (payload: {
    userId: string;
    status: PlayerPresence['status'];
    seatId: string | null;
    voice: PlayerPresence['voice'];
  }) => void;
  onSeatChange: (seatId: string, userId: string | null) => void;
  onVoiceGroup: (groupId: string | null, members: string[]) => void;
  onChat: (message: ChatMessage) => void;
  onError: (message: string, code: string) => void;
}

/**
 * Client-side world simulation.
 *
 * The client predicts its own movement so walking feels immediate, but the
 * server stays authoritative: a rejected move arrives as a correction and the
 * avatar snaps back (SPEC 11.4). Remote avatars are interpolated rather than
 * teleported, which is what hides the 15 Hz update rate.
 */
export class CafeEngine {
  private entities = new Map<string, Entity>();
  private selfId: string | null = null;
  private input: InputState = { up: false, down: false, left: false, right: false, vector: null };
  private sendAccumulator = 0;
  private sequence = 0;
  private lastSentX = 0;
  private lastSentY = 0;
  private presenceAccumulator = 0;
  private occupancy = new Map<string, boolean>();
  private seatOwners = new Map<string, string>();
  private mutedUsers = new Set<string>();
  private voiceMembers = new Set<string>();
  private nearbySeat: SeatDefinition | null = null;
  private reducedMotion = false;
  private elapsed = 0;

  constructor(
    private readonly socket: Socket,
    private readonly callbacks: EngineCallbacks,
  ) {
    this.bind();
  }

  // ------------------------------------------------------------------ wiring

  private bind(): void {
    this.socket.on(SERVER_EVENTS.worldSnapshot, (snapshot: WorldSnapshot) => {
      this.applySnapshot(snapshot);
      this.callbacks.onSnapshot(snapshot);
    });

    this.socket.on(SERVER_EVENTS.playerJoined, (player: PlayerPresence) => {
      this.upsertPlayer(player);
      this.callbacks.onPlayerJoined(player);
    });

    this.socket.on(SERVER_EVENTS.playerLeft, ({ userId }: { userId: string }) => {
      this.entities.delete(userId);
      for (const [seatId, owner] of this.seatOwners) {
        if (owner === userId) {
          this.seatOwners.delete(seatId);
          this.occupancy.set(seatId, false);
        }
      }
      this.callbacks.onPlayerLeft(userId);
    });

    // One batched frame per server tick carries every player who moved.
    // Positions are targets, not jumps: the render loop interpolates towards
    // them, so a 15 Hz tick still looks smooth at any frame rate.
    this.socket.on(SERVER_EVENTS.worldDelta, ({ players }: WorldDeltaEvent) => {
      for (const { userId, x, y, direction } of players) {
        // Our own avatar is client-predicted; corrections arrive separately.
        if (userId === this.selfId) continue;
        const entity = this.entities.get(userId);
        if (!entity) continue;
        entity.targetX = x;
        entity.targetY = y;
        entity.direction = direction as Direction;
      }
    });

    this.socket.on(SERVER_EVENTS.playerState, (payload: Parameters<EngineCallbacks['onPlayerState']>[0]) => {
      const entity = this.entities.get(payload.userId);
      if (entity) {
        entity.status = payload.status;
        entity.seated = Boolean(payload.seatId);
        entity.micOn = payload.voice.micOn;
        entity.inVoiceGroup = Boolean(payload.voice.groupId);
        if (payload.seatId) {
          const seat = SEATS_BY_ID.get(payload.seatId);
          if (seat) {
            const anchor = seatAnchor(seat);
            entity.targetX = anchor.x;
            entity.targetY = anchor.y;
            entity.direction = seat.facing;
            if (payload.userId === this.selfId) {
              entity.x = anchor.x;
              entity.y = anchor.y;
            }
          }
        }
      }
      this.callbacks.onPlayerState(payload);
    });

    this.socket.on(SERVER_EVENTS.playerCorrection, (payload: { x: number; y: number; reason: string }) => {
      const self = this.selfEntity();
      if (!self) return;
      self.x = payload.x;
      self.y = payload.y;
      self.targetX = payload.x;
      self.targetY = payload.y;
    });

    this.socket.on(SERVER_EVENTS.seatOccupied, ({ seatId, userId }: { seatId: string; userId: string | null }) => {
      this.occupancy.set(seatId, true);
      if (userId) this.seatOwners.set(seatId, userId);
      this.callbacks.onSeatChange(seatId, userId);
    });

    this.socket.on(SERVER_EVENTS.seatReleased, ({ seatId }: { seatId: string }) => {
      this.occupancy.set(seatId, false);
      this.seatOwners.delete(seatId);
      this.callbacks.onSeatChange(seatId, null);
    });

    this.socket.on(
      SERVER_EVENTS.voiceState,
      ({ userId, voice }: { userId: string; voice: PlayerPresence['voice'] }) => {
        const entity = this.entities.get(userId);
        if (!entity) return;
        entity.micOn = voice.micOn;
        entity.inVoiceGroup = Boolean(voice.groupId);
      },
    );

    this.socket.on(
      SERVER_EVENTS.voiceGroup,
      ({ groupId, members }: { groupId: string | null; members: string[] }) => {
        this.voiceMembers = new Set(members);
        this.callbacks.onVoiceGroup(groupId, members);
      },
    );

    this.socket.on(SERVER_EVENTS.chatReceived, (message: ChatMessage) => {
      this.callbacks.onChat(message);
    });

    this.socket.on(SERVER_EVENTS.systemError, ({ message, code }: { message: string; code: string }) => {
      this.callbacks.onError(message, code);
    });
  }

  private applySnapshot(snapshot: WorldSnapshot): void {
    this.selfId = snapshot.self.userId;
    this.entities.clear();
    this.upsertPlayer(snapshot.self);
    for (const player of snapshot.players) this.upsertPlayer(player);
    for (const npc of snapshot.npcs) this.upsertNpc(npc);

    this.occupancy.clear();
    this.seatOwners.clear();
    for (const seat of snapshot.seats) {
      this.occupancy.set(seat.seatId, Boolean(seat.userId));
      if (seat.userId) this.seatOwners.set(seat.seatId, seat.userId);
    }
    // NPC seats are occupied by definition.
    for (const npc of snapshot.npcs) {
      if (npc.seatId) this.occupancy.set(npc.seatId, true);
    }
  }

  private upsertPlayer(player: PlayerPresence): void {
    const existing = this.entities.get(player.userId);
    this.entities.set(player.userId, {
      id: player.userId,
      displayName: player.displayName,
      presetId: player.avatar.presetId,
      x: existing?.x ?? player.x,
      y: existing?.y ?? player.y,
      targetX: player.x,
      targetY: player.y,
      direction: player.direction,
      seated: Boolean(player.seatId),
      status: player.status,
      micOn: player.voice.micOn,
      inVoiceGroup: Boolean(player.voice.groupId),
      isNpc: false,
      phase: existing?.phase ?? Math.random() * 10,
      moving: false,
    });
  }

  private upsertNpc(npc: NpcPresence): void {
    this.entities.set(npc.npcId, {
      id: npc.npcId,
      displayName: npc.displayName,
      presetId: npc.avatar.presetId,
      x: npc.x,
      y: npc.y,
      targetX: npc.x,
      targetY: npc.y,
      direction: npc.direction,
      seated: Boolean(npc.seatId),
      status: 'working',
      micOn: false,
      inVoiceGroup: false,
      isNpc: true,
      phase: Math.random() * 10,
      moving: false,
    });
  }

  private selfEntity(): Entity | undefined {
    return this.selfId ? this.entities.get(this.selfId) : undefined;
  }

  // ------------------------------------------------------------------- input

  setInput(input: InputState): void {
    this.input = input;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  setMutedUsers(users: string[]): void {
    this.mutedUsers = new Set(users);
  }

  /**
   * Screen-space WASD mapped onto the isometric axes: pressing "up" walks
   * towards the back of the room, not towards +x.
   *
   * A joystick vector, when one is held, goes through the same mapping and
   * keeps its magnitude, so a half-deflected thumb walks at half speed.
   */
  private intent(): { dx: number; dy: number } {
    if (this.input.vector) {
      const stick = joystickToWorld(this.input.vector);
      if (stick.dx !== 0 || stick.dy !== 0) return stick;
    }

    let dx = 0;
    let dy = 0;
    if (this.input.up) {
      dx -= 1;
      dy -= 1;
    }
    if (this.input.down) {
      dx += 1;
      dy += 1;
    }
    if (this.input.left) {
      dx -= 1;
      dy += 1;
    }
    if (this.input.right) {
      dx += 1;
      dy -= 1;
    }
    const length = Math.hypot(dx, dy);
    if (length === 0) return { dx: 0, dy: 0 };
    return { dx: dx / length, dy: dy / length };
  }

  // ------------------------------------------------------------------ update

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds * 1000;
    const self = this.selfEntity();

    for (const entity of this.entities.values()) {
      if (entity.id === this.selfId) continue;
      const dx = entity.targetX - entity.x;
      const dy = entity.targetY - entity.y;
      const distance = Math.hypot(dx, dy);
      entity.moving = distance > 0.02 && !entity.seated;
      if (distance > 0.001) {
        // Exponential ease: fast enough to keep up, smooth enough to hide jitter.
        const factor = 1 - Math.exp(-14 * deltaSeconds);
        entity.x += dx * factor;
        entity.y += dy * factor;
      }
      entity.phase += deltaSeconds * (entity.moving ? 1 : 0.35);
    }

    if (!self) return;

    if (self.seated) {
      self.moving = false;
      self.phase += deltaSeconds * 0.35;
    } else {
      const { dx, dy } = this.intent();
      if (dx !== 0 || dy !== 0) {
        const step = WALK_SPEED * deltaSeconds;
        const nextX = self.x + dx * step;
        const nextY = self.y + dy * step;
        // Slide along obstacles instead of sticking to them.
        if (isWalkable(nextX, self.y, AVATAR_RADIUS)) self.x = nextX;
        if (isWalkable(self.x, nextY, AVATAR_RADIUS)) self.y = nextY;
        self.direction = vectorToDirection(dx, dy, self.direction);
        self.moving = true;
      } else {
        self.moving = false;
      }
      self.phase += deltaSeconds * (self.moving ? 1 : 0.35);
    }

    this.nearbySeat = this.findNearbySeat(self);

    this.sendAccumulator += deltaSeconds;
    if (this.sendAccumulator >= 1 / MOVE_SEND_HZ) {
      this.sendAccumulator = 0;
      const moved = Math.hypot(self.x - this.lastSentX, self.y - this.lastSentY) > 0.002;
      if (moved && !self.seated) {
        this.sequence += 1;
        this.lastSentX = self.x;
        this.lastSentY = self.y;
        this.socket.emit(CLIENT_EVENTS.playerMove, {
          sequence: this.sequence,
          x: Number(self.x.toFixed(3)),
          y: Number(self.y.toFixed(3)),
          direction: self.direction,
        });
      }
    }

    this.presenceAccumulator += deltaSeconds;
    if (this.presenceAccumulator >= 0.25) {
      this.presenceAccumulator = 0;
      this.callbacks.onPresenceTick({
        self: { x: self.x, y: self.y, seatId: this.seatIdOf(self.id) },
        nearbySeatId: this.nearbySeat?.seatId ?? null,
      });
    }
  }

  private seatIdOf(userId: string): string | null {
    for (const [seatId, owner] of this.seatOwners) {
      if (owner === userId) return seatId;
    }
    return null;
  }

  /** The closest free seat within reach, for the interaction prompt. */
  private findNearbySeat(self: Entity): SeatDefinition | null {
    if (self.seated) return null;
    let best: SeatDefinition | null = null;
    let bestDistance = SEAT_INTERACT_RADIUS;
    for (const seat of SEAT_DEFINITIONS) {
      if (seat.npcOnly) continue;
      if (this.occupancy.get(seat.seatId)) continue;
      const anchor = seatAnchor(seat);
      const distance = Math.hypot(anchor.x - self.x, anchor.y - self.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = seat;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- actions

  sitNearby(): void {
    if (this.nearbySeat) this.socket.emit(CLIENT_EVENTS.playerSit, { seatId: this.nearbySeat.seatId });
  }

  sit(seatId: string): void {
    this.socket.emit(CLIENT_EVENTS.playerSit, { seatId });
  }

  stand(): void {
    this.socket.emit(CLIENT_EVENTS.playerStand, {});
  }

  /** The seat under a world point, for canvas clicks. */
  seatAtWorld(worldX: number, worldY: number): SeatDefinition | null {
    return (
      SEAT_DEFINITIONS.find(
        (seat) =>
          !seat.npcOnly &&
          worldX >= seat.x &&
          worldX < seat.x + 1 &&
          worldY >= seat.y &&
          worldY < seat.y + 1,
      ) ?? null
    );
  }

  /** Where the camera is looking, so the renderer and hit tests agree. */
  cameraTarget(): { x: number; y: number } {
    const self = this.selfEntity();
    return { x: self?.x ?? 12, y: self?.y ?? 9 };
  }

  get nearbySeatId(): string | null {
    return this.nearbySeat?.seatId ?? null;
  }

  isSeated(): boolean {
    return this.selfEntity()?.seated ?? false;
  }

  // ------------------------------------------------------------------- scene

  sceneInput(): SceneInput {
    const self = this.selfEntity();
    const avatars: AvatarRenderState[] = [];
    for (const entity of this.entities.values()) {
      const pose = this.seatedPose(entity);
      avatars.push({
        id: entity.id,
        seatId: entity.seated ? this.seatIdOf(entity.id) : null,
        x: pose.x,
        y: pose.y,
        direction: pose.direction,
        moving: entity.moving,
        seated: entity.seated,
        phase: entity.phase,
        status: entity.status,
        displayName: entity.displayName,
        presetId: entity.presetId,
        isNpc: entity.isNpc,
        isSelf: entity.id === this.selfId,
        micOn: entity.micOn,
        inVoiceGroup: entity.inVoiceGroup || this.voiceMembers.has(entity.id),
        mutedByViewer: this.mutedUsers.has(entity.id),
        reducedMotion: this.reducedMotion,
      });
    }
    return {
      avatars,
      occupancy: this.occupancy,
      highlightSeatId: this.nearbySeat?.seatId ?? null,
      time: this.elapsed,
      reducedMotion: this.reducedMotion,
      cameraX: self?.x ?? 12,
      cameraY: self?.y ?? 10,
    };
  }

  /**
   * Where a seated avatar is *drawn*.
   *
   * A sofa seat tile is the floor in front of the sofa (the sofa itself is
   * solid), so drawing the avatar on the seat anchor left it hovering on the
   * rug. Draw it on the cushion instead, facing away from the backrest. Only
   * the picture moves: the logical position stays on the walkable seat tile,
   * so standing up and the server's reach and collision checks are unchanged.
   */
  private seatedPose(entity: Entity): { x: number; y: number; direction: Entity['direction'] } {
    const base = { x: entity.x, y: entity.y, direction: entity.direction };
    if (!entity.seated) return base;
    const seatId = this.seatIdOf(entity.id);
    const seat = seatId ? SEATS_BY_ID.get(seatId) : undefined;
    if (!seat || seat.seatType !== 'sofa') return base;
    return { x: entity.x, y: entity.y - SOFA_CUSHION_OFFSET, direction: 'south' };
  }

  destroy(): void {
    this.entities.clear();
  }
}
