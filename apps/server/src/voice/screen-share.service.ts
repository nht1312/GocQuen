import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SEATS_BY_ID } from '@virtual-cafe/shared';
import { Store } from '../storage/store';
import { InstanceManager } from '../world/instance-manager.service';

/** Why an active session ended. Persisted as metadata, never screen content. */
export type ScreenShareEndReason =
  | 'manual'
  | 'left_table'
  | 'left_cafe'
  | 'disconnected'
  | 'track_ended';

export interface ScreenShareSession {
  id: string;
  instanceId: string;
  /** The table, i.e. the seat group. Always derived, never client-supplied. */
  groupId: string;
  publisherId: string;
  publisherName: string;
  startedAt: number;
}

export type ScreenShareClaim =
  | { ok: true; session: ScreenShareSession }
  | { ok: false; code: 'forbidden' | 'conflict' | 'not_found'; message: string };

export type ScreenShareRelease =
  | { ok: true; session: ScreenShareSession }
  | { ok: false; code: 'forbidden' | 'not_found'; message: string };

/**
 * Who is sharing their screen at which table (spec §5).
 *
 * The authorisation rule is the same one voice uses: the table comes from the
 * seat the *server* says the player occupies, so there is no table id to
 * tamper with. A caller cannot name a table, only act on their own.
 *
 * Concurrency: `claim` does a check-and-set with no `await` between the check
 * and the write. Node runs that to completion without interleaving, so two
 * simultaneous requests cannot both win the slot. A database transaction would
 * not help here anyway — the café runs as a single instance and the default
 * deployment has no database at all (see README, "Scaling with occupancy").
 * Persistence of session metadata is for audit, never for the race.
 */
@Injectable()
export class ScreenShareService {
  private readonly logger = new Logger(ScreenShareService.name);

  /** Active session per table, keyed by `instanceId::groupId`. */
  private readonly sessions = new Map<string, ScreenShareSession>();

  constructor(
    private readonly instances: InstanceManager,
    private readonly store: Store,
  ) {}

  /**
   * Write the audit row without blocking the caller.
   *
   * `claim` and `release` are synchronous on purpose — that is what makes the
   * one-publisher-per-table check atomic, since Node cannot interleave another
   * request in the middle of it. Awaiting a database write there would open
   * exactly the race the synchronous path exists to prevent. So the audit
   * write is fired afterwards, and a failure is logged rather than thrown: a
   * database problem must not stop people sharing their screen.
   */
  private audit(write: Promise<void>, what: string): void {
    void write.catch((error: unknown) => {
      this.logger.warn(`Could not record screen share ${what}: ${String(error)}`);
    });
  }

  private static key(instanceId: string, groupId: string): string {
    return `${instanceId}::${groupId}`;
  }

  /**
   * The table this player is currently seated at, as the server sees it.
   * Returns null when they are not in the café or not sitting down.
   */
  private tableOf(userId: string): { instanceId: string; groupId: string } | null {
    const instance = this.instances.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return null;

    const seatId = player.presence.seatId;
    if (!seatId) return null;

    const seat = SEATS_BY_ID.get(seatId);
    if (!seat) return null;

    return { instanceId: instance.id, groupId: seat.seatGroupId };
  }

  /**
   * A session only exists while its publisher is still able to produce it:
   * in the café, seated at that same table, and holding a live socket.
   *
   * This is checked on read rather than maintained by hooks. Standing up,
   * changing table, leaving and disconnecting all go through different code
   * paths, and a hook that someone forgets to call would leave a table unable
   * to share because a ghost holds the slot. Deriving it means a stale session
   * cannot be observed even if no hook fires.
   *
   * The disconnect case deliberately matches how voice behaves in `detach`:
   * the seat is held through the grace window so the avatar does not vanish,
   * but the media session ends immediately.
   */
  private live(session: ScreenShareSession): boolean {
    const instance = this.instances.getInstance(session.instanceId);
    const player = instance?.players.get(session.publisherId);
    if (!instance || !player) return false;
    if (player.socketId === null) return false;

    const seatId = player.presence.seatId;
    if (!seatId) return false;
    return SEATS_BY_ID.get(seatId)?.seatGroupId === session.groupId;
  }

  /** Read the session at a table, dropping it first if it is no longer live. */
  private activeAt(instanceId: string, groupId: string): ScreenShareSession | null {
    const key = ScreenShareService.key(instanceId, groupId);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (this.live(session)) return session;
    this.sessions.delete(key);
    return null;
  }

  /** Take the publisher slot for the caller's own table. */
  claim(userId: string): ScreenShareClaim {
    const instance = this.instances.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) {
      return { ok: false, code: 'forbidden', message: 'Bạn chưa ở trong quán' };
    }

    const table = this.tableOf(userId);
    if (!table) {
      return { ok: false, code: 'forbidden', message: 'Hãy ngồi vào bàn để chia sẻ màn hình' };
    }

    const key = ScreenShareService.key(table.instanceId, table.groupId);
    const existing = this.activeAt(table.instanceId, table.groupId);
    if (existing) {
      // Re-claiming your own slot is a no-op, so a retry after a flaky network
      // does not look like someone else is already sharing.
      if (existing.publisherId === userId) return { ok: true, session: existing };
      return {
        ok: false,
        code: 'conflict',
        message: `${existing.publisherName} đang chia sẻ màn hình ở bàn này`,
      };
    }

    const session: ScreenShareSession = {
      id: randomUUID(),
      instanceId: table.instanceId,
      groupId: table.groupId,
      publisherId: userId,
      publisherName: player.presence.displayName,
      startedAt: Date.now(),
    };
    this.sessions.set(key, session);
    this.logger.log(`Screen share ${session.id} started by ${userId} at ${table.groupId}`);
    this.audit(
      this.store.recordScreenShareStart({
        id: session.id,
        instanceId: session.instanceId,
        groupId: session.groupId,
        publisherId: session.publisherId,
        startedAt: session.startedAt,
      }),
      'start',
    );
    return { ok: true, session };
  }

  /** Give up the slot. Only the publisher may end their own session. */
  release(userId: string, reason: ScreenShareEndReason): ScreenShareRelease {
    for (const [key, session] of this.sessions) {
      if (session.publisherId !== userId) continue;
      this.sessions.delete(key);
      this.logger.log(`Screen share ${session.id} ended (${reason})`);
      this.audit(this.store.recordScreenShareEnd(session.id, reason, Date.now()), 'end');
      return { ok: true, session };
    }
    return { ok: false, code: 'not_found', message: 'Bạn không chia sẻ màn hình' };
  }

  /**
   * The session this player is allowed to know about: the one at their own
   * table, or null. Someone at another table gets null rather than a refusal,
   * because the existence of another table's session is itself not their
   * business.
   */
  visibleTo(userId: string): ScreenShareSession | null {
    const table = this.tableOf(userId);
    if (!table) return null;
    return this.activeAt(table.instanceId, table.groupId);
  }

  /**
   * Whether this player's LiveKit token may carry the `screen_share` publish
   * source. True only for the current slot holder, so a modified client cannot
   * publish a screen even though it can legitimately join the table's room.
   */
  mayPublishScreen(userId: string): boolean {
    return this.visibleTo(userId)?.publisherId === userId;
  }

  /**
   * Exactly who may be told about this session.
   *
   * This is the authorisation boundary for every broadcast: everyone seated at
   * that table, plus the publisher. The publisher is included even once they
   * have stood up or moved tables, because their own client still has a panel
   * open and has to be told it ended — and it is their own session, so this
   * reveals nothing they did not already know.
   *
   * Nobody else is ever in the list, including people standing beside the
   * table and people seated elsewhere in the same café.
   */
  audienceFor(session: ScreenShareSession): string[] {
    const instance = this.instances.getInstance(session.instanceId);
    if (!instance) return [session.publisherId];
    const seated = this.instances.tableMembers(instance, session.groupId);
    return seated.includes(session.publisherId) ? seated : [...seated, session.publisherId];
  }

  /**
   * Drop this user's session if it is no longer live, and report it so the
   * caller can tell the table once.
   *
   * Reads already self-heal, but a silent disappearance would leave viewers
   * watching a frozen frame. Lifecycle handlers call this to turn the implicit
   * expiry into an explicit `screen-share:stopped`. Returns null when there is
   * nothing to announce, including on a second call, so the event cannot be
   * broadcast twice.
   */
  releaseIfStale(userId: string, reason: ScreenShareEndReason): ScreenShareSession | null {
    for (const [key, session] of this.sessions) {
      if (session.publisherId !== userId) continue;
      if (this.live(session)) return null;
      this.sessions.delete(key);
      this.logger.log(`Screen share ${session.id} ended (${reason})`);
      this.audit(this.store.recordScreenShareEnd(session.id, reason, Date.now()), 'end');
      return session;
    }
    return null;
  }
}
