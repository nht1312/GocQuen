import { randomUUID } from 'node:crypto';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  CLIENT_EVENTS,
  ChatMessage,
  HEARTBEAT_TIMEOUT_MS,
  RateLimitedEvent,
  SEATS_BY_ID,
  SERVER_EVENTS,
  SystemErrorEvent,
  WORLD_TICK_MS,
  chatSendSchema,
  playerMoveSchema,
  playerSitSchema,
  playerStateSchema,
  voiceJoinSchema,
  voiceStateSchema,
} from '@virtual-cafe/shared';
import { SessionClaims, SessionService } from '../auth/session.service';
import {
  ScreenShareEndReason,
  ScreenShareObserver,
  ScreenShareService,
  ScreenShareSession,
} from '../voice/screen-share.service';
import { RateLimiter } from '../common/rate-limiter';
import { AppConfig } from '../config/app-config';
import { MetricsService } from '../metrics/metrics.service';
import { Store } from '../storage/store';
import { CafeInstance, InstanceManager } from '../world/instance-manager.service';

interface SocketData {
  session: SessionClaims;
  limiter: RateLimiter;
  joined: boolean;
  lastSeenAt: number;
  blocked: Set<string>;
  blocksLoadedAt: number;
}

const BLOCK_CACHE_MS = 30_000;

type CafeSocket = Socket & { data: SocketData };

function roomOf(instanceId: string): string {
  return `instance:${instanceId}`;
}

/**
 * Realtime gateway (SPEC 11.5, 13.2, 14.1).
 *
 * Every handler follows the same order: rate limit, schema validation,
 * authorisation, then state change. The client never supplies its instance,
 * its seat ownership or its voice permission — those come from the session and
 * the authoritative InstanceManager.
 */
/**
 * Socket.IO CORS mirrors the HTTP policy. Sessions travel as a bearer token in
 * the handshake rather than a cookie, so this is defence in depth, not the
 * authentication boundary.
 */
function socketOriginAllowed(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  const configured = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production';
  const allowed = isProduction
    ? !origin || configured.includes(origin)
    : !origin ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      configured.includes(origin);
  callback(null, allowed);
}

@WebSocketGateway({
  cors: { origin: socketOriginAllowed, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy,
    ScreenShareObserver
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;

  /**
   * Players whose position changed since the last tick, keyed by instance.
   *
   * Only ids are stored, never coordinates: the flush reads each player's
   * current presence, so the batch can never carry a position that has since
   * been superseded (for example by sitting down).
   */
  private readonly movedSinceTick = new Map<string, Set<string>>();

  constructor(
    private readonly sessions: SessionService,
    private readonly instances: InstanceManager,
    private readonly screenShare: ScreenShareService,
    private readonly metrics: MetricsService,
    private readonly store: Store,
    private readonly config: AppConfig,
  ) {}

  afterInit(server: Server): void {
    // Every start and stop reaches the table through here, whichever door it
    // came in by — the REST endpoints the web client uses, the socket events,
    // or a lifecycle sweep. See `ScreenShareObserver`.
    this.screenShare.observe(this);

    server.engine?.on?.('connection_error', (error: Error) => {
      this.logger.warn(`Engine connection error: ${error.message}`);
    });

    // A player whose grace period expired must not linger as a ghost avatar.
    this.instances.on('player-expired', ({ instanceId, userId, seatId }) => {
      this.server.to(roomOf(instanceId)).emit(SERVER_EVENTS.playerLeft, { userId });
      if (seatId) {
        this.server.to(roomOf(instanceId)).emit(SERVER_EVENTS.seatReleased, { seatId, userId: null });
      }
      this.logger.log(`Cleaned up expired session for ${userId}`);
    });

    // Drop sockets that stopped sending heartbeats (SPEC 16.2).
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const socket of this.server.sockets.sockets.values()) {
        const data = (socket as CafeSocket).data;
        if (!data?.joined) continue;
        if (now - data.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
          this.logger.warn(`Heartbeat timeout for ${data.session.sub}`);
          socket.disconnect(true);
        }
      }
    }, 10_000);
    this.heartbeatTimer.unref?.();

    // Relay movement on a fixed tick instead of once per inbound message.
    this.tickTimer = setInterval(() => this.flushMovement(), WORLD_TICK_MS);
    this.tickTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.heartbeatTimer = null;
    this.tickTimer = null;
  }

  /** Queue a player for the next movement broadcast. */
  private markMoved(instanceId: string, userId: string): void {
    const pending = this.movedSinceTick.get(instanceId);
    if (pending) pending.add(userId);
    else this.movedSinceTick.set(instanceId, new Set([userId]));
  }

  /**
   * Emit one batched delta per instance that saw movement this tick.
   *
   * The sender receives its own entry too — excluding it would mean one emit
   * per recipient, which is exactly the per-event cost this replaces. Clients
   * already ignore their own id because they predict their own position.
   */
  private flushMovement(): void {
    if (this.movedSinceTick.size === 0) return;
    for (const [instanceId, userIds] of this.movedSinceTick) {
      const instance = this.instances.getInstance(instanceId);
      if (!instance) continue;
      const players = [];
      for (const userId of userIds) {
        const player = instance.players.get(userId);
        if (!player) continue; // left or expired mid-tick
        players.push({
          userId,
          x: player.presence.x,
          y: player.presence.y,
          direction: player.presence.direction,
        });
      }
      if (players.length > 0) {
        this.server.to(roomOf(instanceId)).emit(SERVER_EVENTS.worldDelta, { players });
      }
    }
    this.movedSinceTick.clear();
  }

  handleConnection(socket: CafeSocket): void {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);
      socket.data = {
        session: this.sessions.verify(token),
        limiter: new RateLimiter(),
        joined: false,
        lastSeenAt: Date.now(),
        blocked: new Set(),
        blocksLoadedAt: 0,
      };
      // Liveness is the transport's business, not the application's. Counting
      // only app events would evict a perfectly healthy client that happens to
      // be sitting still and saying nothing.
      socket.conn?.on('packet', () => {
        socket.data.lastSeenAt = Date.now();
      });
    } catch {
      socket.emit(SERVER_EVENTS.systemError, {
        event: 'connection',
        code: 'forbidden',
        message: 'Phiên đăng nhập không hợp lệ. Vui lòng vào quán lại.',
      } satisfies SystemErrorEvent);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: CafeSocket): void {
    if (!socket.data?.joined) return;
    const userId = socket.data.session.sub;
    const player = this.instances.getPlayer(userId);
    // Ignore the stale socket of a player who already reconnected elsewhere.
    if (player && player.socketId !== socket.id) return;
    this.instances.detach(userId);
    // The socket is gone, so the media is gone — do not make the table wait
    // out the seat's grace period staring at a frozen frame.
    this.sweepScreenShare(userId, 'disconnected');
    this.metrics.increment('socket_disconnects_total');
    const instance = this.instances.findInstanceOf(userId);
    if (instance) {
      this.broadcastState(instance, userId);
    }
  }

  // ------------------------------------------------------------------- helpers

  private guard(socket: CafeSocket, event: RateLimitedEvent): boolean {
    socket.data.lastSeenAt = Date.now();
    if (socket.data.limiter.take(event)) return true;
    this.metrics.increment('events_rate_limited_total');
    socket.emit(SERVER_EVENTS.systemError, {
      event,
      code: 'rate_limited',
      message: 'Bạn thao tác hơi nhanh, chậm lại một chút nhé.',
    } satisfies SystemErrorEvent);
    return false;
  }

  private parse<T>(socket: CafeSocket, event: string, schema: z.ZodType<T>, body: unknown): T | null {
    const result = schema.safeParse(body ?? {});
    if (result.success) return result.data;
    this.metrics.increment('events_rejected_total');
    socket.emit(SERVER_EVENTS.systemError, {
      event,
      code: 'invalid_payload',
      message: result.error.issues[0]?.message ?? 'Dữ liệu gửi lên không hợp lệ',
    } satisfies SystemErrorEvent);
    return null;
  }

  private socketOf(userId: string): CafeSocket | undefined {
    const socketId = this.instances.getPlayer(userId)?.socketId;
    if (!socketId) return undefined;
    return this.server.sockets.sockets.get(socketId) as CafeSocket | undefined;
  }

  private broadcastState(instance: CafeInstance, userId: string): void {
    const player = instance.players.get(userId);
    if (!player) return;
    this.server.to(roomOf(instance.id)).emit(SERVER_EVENTS.playerState, {
      userId,
      status: player.presence.status,
      seatId: player.presence.seatId,
      voice: player.presence.voice,
    });
  }

  /** Tell everyone in a conversation group who is currently in it. */
  private broadcastVoiceGroup(instance: CafeInstance, groupId: string): void {
    const members = this.instances.groupMembers(instance, groupId);
    for (const memberId of members) {
      this.socketOf(memberId)?.emit(SERVER_EVENTS.voiceGroup, { groupId, members });
    }
  }

  private async blockedBy(socket: CafeSocket): Promise<Set<string>> {
    const now = Date.now();
    if (now - socket.data.blocksLoadedAt < BLOCK_CACHE_MS) return socket.data.blocked;
    const blocked = await this.store.listBlocks(socket.data.session.sub);
    socket.data.blocked = new Set(blocked);
    socket.data.blocksLoadedAt = now;
    return socket.data.blocked;
  }

  // -------------------------------------------------------------------- events

  @SubscribeMessage(CLIENT_EVENTS.worldJoin)
  async onWorldJoin(@ConnectedSocket() socket: CafeSocket): Promise<void> {
    socket.data.lastSeenAt = Date.now();
    if (socket.data.joined) return;

    const { session } = socket.data;
    const user = await this.store.findUser(session.sub);
    const displayName = user?.displayName ?? session.name;
    const avatar = user?.avatar ?? { presetId: session.preset };

    // Second tab from the same account: the newest socket wins.
    const existingSocketId = this.instances.getPlayer(session.sub)?.socketId;
    if (existingSocketId && existingSocketId !== socket.id) {
      this.server.sockets.sockets.get(existingSocketId)?.disconnect(true);
    }

    const { instance, player, reconnected } = this.instances.join(
      { id: session.sub, displayName, avatar },
      socket.id,
    );
    socket.data.joined = true;
    await socket.join(roomOf(instance.id));
    this.metrics.increment(reconnected ? 'socket_reconnects_total' : 'cafe_joins_total');

    const snapshot = this.instances.snapshotFor(session.sub);
    if (snapshot) socket.emit(SERVER_EVENTS.worldSnapshot, snapshot);
    socket.to(roomOf(instance.id)).emit(SERVER_EVENTS.playerJoined, player.presence);
    this.logger.log(
      `${displayName} ${reconnected ? 'reconnected to' : 'entered'} instance ${instance.id}`,
    );
  }

  @SubscribeMessage(CLIENT_EVENTS.worldLeave)
  onWorldLeave(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined) return;
    const userId = socket.data.session.sub;
    const removed = this.instances.remove(userId);
    // Sweep after removal: the session is keyed by publisher, so it is still
    // findable, and it is now unambiguously stale.
    this.sweepScreenShare(userId, 'left_cafe');
    socket.data.joined = false;
    if (removed) {
      this.server.to(roomOf(removed.instanceId)).emit(SERVER_EVENTS.playerLeft, { userId });
      if (removed.seatId) {
        this.server
          .to(roomOf(removed.instanceId))
          .emit(SERVER_EVENTS.seatReleased, { seatId: removed.seatId, userId: null });
      }
      this.metrics.increment('cafe_leaves_total');
    }
  }

  @SubscribeMessage(CLIENT_EVENTS.playerMove)
  onPlayerMove(@ConnectedSocket() socket: CafeSocket, @MessageBody() body: unknown): void {
    if (!socket.data.joined || !this.guard(socket, 'player:move')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.playerMove, playerMoveSchema, body);
    if (!payload) return;

    const started = Date.now();
    const result = this.instances.move(socket.data.session.sub, payload);
    this.metrics.observeMoveLatency(Date.now() - started);

    if (!result.ok) {
      this.metrics.increment('events_rejected_total');
      socket.emit(SERVER_EVENTS.playerCorrection, {
        sequence: payload.sequence,
        x: result.x,
        y: result.y,
        reason: result.reason,
      });
      return;
    }
    const instance = this.instances.findInstanceOf(socket.data.session.sub);
    if (!instance) return;
    this.markMoved(instance.id, result.presence.userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.playerState)
  onPlayerState(@ConnectedSocket() socket: CafeSocket, @MessageBody() body: unknown): void {
    if (!socket.data.joined || !this.guard(socket, 'player:state')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.playerState, playerStateSchema, body);
    if (!payload) return;
    const presence = this.instances.setStatus(socket.data.session.sub, payload.status);
    const instance = this.instances.findInstanceOf(socket.data.session.sub);
    if (presence && instance) this.broadcastState(instance, presence.userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.playerSit)
  onPlayerSit(@ConnectedSocket() socket: CafeSocket, @MessageBody() body: unknown): void {
    if (!socket.data.joined || !this.guard(socket, 'player:sit')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.playerSit, playerSitSchema, body);
    if (!payload) return;

    const userId = socket.data.session.sub;
    const result = this.instances.sit(userId, payload.seatId);
    if (!result.ok) {
      if (result.code === 'conflict') this.metrics.increment('seat_conflicts_total');
      socket.emit(SERVER_EVENTS.systemError, {
        event: CLIENT_EVENTS.playerSit,
        code: result.code,
        message: result.message,
      } satisfies SystemErrorEvent);
      return;
    }

    const instance = this.instances.findInstanceOf(userId);
    if (!instance) return;
    this.metrics.increment('seat_claims_total');
    // Moving to another table ends a share held at the one just left.
    this.sweepScreenShare(userId, 'left_table');
    if (result.releasedSeatId) {
      this.server
        .to(roomOf(instance.id))
        .emit(SERVER_EVENTS.seatReleased, { seatId: result.releasedSeatId, userId: null });
    }
    this.server.to(roomOf(instance.id)).emit(SERVER_EVENTS.seatOccupied, {
      seatId: result.seat.seatId,
      userId,
    });
    this.markMoved(instance.id, userId);
    this.broadcastState(instance, userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.playerStand)
  onPlayerStand(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined || !this.guard(socket, 'player:stand')) return;
    const userId = socket.data.session.sub;
    const instance = this.instances.findInstanceOf(userId);
    const previousGroup = this.instances.getPlayer(userId)?.presence.voice.groupId ?? null;
    const result = this.instances.stand(userId);
    if (!result || !instance) return;
    this.sweepScreenShare(userId, 'left_table');
    if (result.releasedSeatId) {
      this.server
        .to(roomOf(instance.id))
        .emit(SERVER_EVENTS.seatReleased, { seatId: result.releasedSeatId, userId: null });
    }
    this.broadcastState(instance, userId);
    socket.emit(SERVER_EVENTS.voiceGroup, { groupId: null, members: [] });
    if (previousGroup) this.broadcastVoiceGroup(instance, previousGroup);
  }

  @SubscribeMessage(CLIENT_EVENTS.voiceJoin)
  onVoiceJoin(@ConnectedSocket() socket: CafeSocket, @MessageBody() body: unknown): void {
    if (!socket.data.joined || !this.guard(socket, 'voice:join')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.voiceJoin, voiceJoinSchema, body);
    if (!payload) return;

    const userId = socket.data.session.sub;
    const result = this.instances.voiceJoin(userId, payload.groupId);
    if (!result.ok) {
      this.metrics.increment('voice_join_failures_total');
      socket.emit(SERVER_EVENTS.systemError, {
        event: CLIENT_EVENTS.voiceJoin,
        code: result.code,
        message: result.message,
      } satisfies SystemErrorEvent);
      return;
    }
    const instance = this.instances.findInstanceOf(userId);
    if (!instance) return;
    this.metrics.increment('voice_joins_total');
    this.broadcastVoiceGroup(instance, result.groupId);
    this.broadcastState(instance, userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.voiceLeave)
  onVoiceLeave(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined || !this.guard(socket, 'voice:leave')) return;
    const userId = socket.data.session.sub;
    const instance = this.instances.findInstanceOf(userId);
    const result = this.instances.voiceLeave(userId);
    if (!result || !instance) return;
    socket.emit(SERVER_EVENTS.voiceGroup, { groupId: null, members: [] });
    if (result.groupId) this.broadcastVoiceGroup(instance, result.groupId);
    this.broadcastState(instance, userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.voiceState)
  onVoiceState(@ConnectedSocket() socket: CafeSocket, @MessageBody() body: unknown): void {
    if (!socket.data.joined || !this.guard(socket, 'voice:state')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.voiceState, voiceStateSchema, body);
    if (!payload) return;
    const presence = this.instances.setVoiceState(
      socket.data.session.sub,
      payload.micOn,
      payload.connected,
    );
    const instance = this.instances.findInstanceOf(socket.data.session.sub);
    if (!presence || !instance) return;
    // Mic state is public inside the instance: the UI must always show who is live.
    this.server.to(roomOf(instance.id)).emit(SERVER_EVENTS.voiceState, {
      userId: presence.userId,
      voice: presence.voice,
    });
    this.broadcastState(instance, presence.userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.chatSend)
  async onChatSend(
    @ConnectedSocket() socket: CafeSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (!socket.data.joined || !this.guard(socket, 'chat:send')) return;
    const payload = this.parse(socket, CLIENT_EVENTS.chatSend, chatSendSchema, body);
    if (!payload) return;

    const userId = socket.data.session.sub;
    const instance = this.instances.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    const seatId = player?.presence.seatId;
    if (!instance || !player || !seatId) {
      socket.emit(SERVER_EVENTS.systemError, {
        event: CLIENT_EVENTS.chatSend,
        code: 'forbidden',
        message: 'Hãy ngồi vào một bàn để trò chuyện với những người ở đó.',
      } satisfies SystemErrorEvent);
      return;
    }
    const groupId = SEATS_BY_ID.get(seatId)?.seatGroupId;
    if (!groupId) return;

    const message: ChatMessage = {
      id: randomUUID(),
      groupId,
      userId,
      displayName: player.presence.displayName,
      body: payload.body,
      sentAt: Date.now(),
    };

    // Table-scoped, and never delivered to someone who blocked the sender.
    for (const memberId of this.instances.tableMembers(instance, groupId)) {
      const memberSocket = this.socketOf(memberId);
      if (!memberSocket) continue;
      if (memberId !== userId) {
        const blocked = await this.blockedBy(memberSocket);
        if (blocked.has(userId)) continue;
      }
      memberSocket.emit(SERVER_EVENTS.chatReceived, message);
    }
    this.metrics.increment('chat_messages_total');
  }

  @SubscribeMessage(CLIENT_EVENTS.ping)
  onPing(@ConnectedSocket() socket: CafeSocket): void {
    if (!this.guard(socket, 'session:ping')) return;
    socket.emit(SERVER_EVENTS.pong, { serverTime: Date.now() });
  }

  // ------------------------------------------------------------ screen share

  @SubscribeMessage(CLIENT_EVENTS.screenShareStart)
  onScreenShareStart(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined || !this.guard(socket, 'screen-share:start')) return;
    const userId = socket.data.session.sub;

    const result = this.screenShare.claim(userId);
    if (!result.ok) {
      this.metrics.increment('screen_share_rejections_total');
      socket.emit(SERVER_EVENTS.screenShareFailed, {
        code: result.code,
        message: result.message,
      });
      return;
    }
    this.metrics.increment('screen_share_starts_total');
  }

  @SubscribeMessage(CLIENT_EVENTS.screenShareStop)
  onScreenShareStop(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined || !this.guard(socket, 'screen-share:stop')) return;
    const userId = socket.data.session.sub;

    const result = this.screenShare.release(userId, 'manual');
    if (!result.ok) {
      this.metrics.increment('screen_share_rejections_total');
      socket.emit(SERVER_EVENTS.screenShareFailed, {
        code: result.code,
        message: result.message,
      });
      return;
    }
    this.metrics.increment('screen_share_stops_total');
  }

  @SubscribeMessage(CLIENT_EVENTS.screenShareRequestState)
  onScreenShareRequestState(@ConnectedSocket() socket: CafeSocket): void {
    if (!socket.data.joined) return;
    const session = this.screenShare.visibleTo(socket.data.session.sub);
    if (!session) return;
    socket.emit(SERVER_EVENTS.screenShareStarted, this.startedPayload(session));
  }

  private startedPayload(session: ScreenShareSession) {
    // Metadata only. The token is fetched over HTTP by each client for itself.
    return {
      sessionId: session.id,
      groupId: session.groupId,
      publisherId: session.publisherId,
      publisherName: session.publisherName,
      startedAt: session.startedAt,
    };
  }

  /** @see ScreenShareObserver */
  onScreenShareStarted(session: ScreenShareSession): void {
    const payload = this.startedPayload(session);
    for (const memberId of this.screenShare.audienceFor(session)) {
      this.socketOf(memberId)?.emit(SERVER_EVENTS.screenShareStarted, payload);
    }
  }

  /** @see ScreenShareObserver */
  onScreenShareStopped(session: ScreenShareSession, reason: ScreenShareEndReason): void {
    const payload = {
      sessionId: session.id,
      groupId: session.groupId,
      publisherId: session.publisherId,
      reason,
    };
    for (const memberId of this.screenShare.audienceFor(session)) {
      this.socketOf(memberId)?.emit(SERVER_EVENTS.screenShareStopped, payload);
    }
  }

  /**
   * Turn an implicit expiry into something viewers can see.
   *
   * The session is already invalid the moment the publisher stands up, changes
   * table, leaves or drops — `ScreenShareService` derives that on read. Without
   * this sweep, though, viewers would simply be left looking at a frozen last
   * frame with no idea why. Called from each of those lifecycle points; the
   * announcement itself comes back through `onScreenShareStopped`, the same
   * way a deliberate stop does.
   */
  private sweepScreenShare(userId: string, reason: ScreenShareEndReason): void {
    this.screenShare.releaseIfStale(userId, reason);
  }
}
