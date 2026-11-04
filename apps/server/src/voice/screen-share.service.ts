import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SEATS_BY_ID } from '@virtual-cafe/shared';
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

  constructor(private readonly instances: InstanceManager) {}

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
    const existing = this.sessions.get(key);
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
    return { ok: true, session };
  }

  /** Give up the slot. Only the publisher may end their own session. */
  release(userId: string, reason: ScreenShareEndReason): ScreenShareRelease {
    for (const [key, session] of this.sessions) {
      if (session.publisherId !== userId) continue;
      this.sessions.delete(key);
      this.logger.log(`Screen share ${session.id} ended (${reason})`);
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
    return this.sessions.get(ScreenShareService.key(table.instanceId, table.groupId)) ?? null;
  }

  /**
   * Whether this player's LiveKit token may carry the `screen_share` publish
   * source. True only for the current slot holder, so a modified client cannot
   * publish a screen even though it can legitimately join the table's room.
   */
  mayPublishScreen(userId: string): boolean {
    return this.visibleTo(userId)?.publisherId === userId;
  }
}
