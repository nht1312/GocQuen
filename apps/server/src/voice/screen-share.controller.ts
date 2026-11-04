import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RATE_LIMITS, ScreenShareState } from '@virtual-cafe/shared';
import { AuthedRequest, SessionGuard } from '../auth/session.guard';
import { MetricsService } from '../metrics/metrics.service';
import { ScreenShareService, ScreenShareSession } from './screen-share.service';

/**
 * Per-caller token bucket for the start/stop endpoints (spec §9).
 *
 * The socket limiter is per-connection and lives on the socket, so it cannot
 * be reused here. Buckets that have refilled to capacity are dropped, because
 * recreating one gives exactly the same answer — that keeps the map bounded
 * without a sweep timer.
 */
class CallerRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  take(userId: string, event: 'screen-share:start' | 'screen-share:stop'): boolean {
    const limit = RATE_LIMITS[event];
    const key = `${userId}:${event}`;
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: limit.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    const tokens = Math.min(limit.capacity, bucket.tokens + elapsedSeconds * limit.refillPerSecond);

    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: now });
      return false;
    }
    const remaining = tokens - 1;
    if (remaining >= limit.capacity) this.buckets.delete(key);
    else this.buckets.set(key, { tokens: remaining, updatedAt: now });
    return true;
  }
}

/**
 * Screen sharing at your own table (spec §6).
 *
 * Deliberately no table id in any route. The suggested design was
 * `/tables/:tableId/screen-share/*`, which would make every handler
 * responsible for re-checking that the path matches the caller's real seat —
 * and one forgotten check is a cross-table leak. Here the table is read from
 * the server's seat state, so there is no parameter to tamper with. This
 * matches how `POST /voice/token` already works.
 */
@Controller('voice/screen-share')
@UseGuards(SessionGuard)
export class ScreenShareController {
  private readonly limiter = new CallerRateLimiter();

  constructor(
    private readonly screenShare: ScreenShareService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * The authoritative state, so a client that just connected — or reconnected
   * after missing the socket event — can discover a session already running.
   */
  @Get()
  state(@Req() request: AuthedRequest): ScreenShareState {
    return this.describe(request.session.sub);
  }

  @Post('start')
  start(@Req() request: AuthedRequest): ScreenShareState {
    const userId = request.session.sub;
    this.guard(userId, 'screen-share:start');

    const result = this.screenShare.claim(userId);
    if (!result.ok) {
      this.metrics.increment('screen_share_rejections_total');
      throw result.code === 'conflict'
        ? new ConflictException(result.message)
        : new ForbiddenException(result.message);
    }
    this.metrics.increment('screen_share_starts_total');
    return this.describe(userId);
  }

  @Post('stop')
  stop(@Req() request: AuthedRequest): ScreenShareState {
    const userId = request.session.sub;
    this.guard(userId, 'screen-share:stop');

    const result = this.screenShare.release(userId, 'manual');
    if (!result.ok) {
      this.metrics.increment('screen_share_rejections_total');
      // Only the publisher can end a session, so this covers both "nothing is
      // running" and "that is not yours to stop".
      throw new ForbiddenException(result.message);
    }
    this.metrics.increment('screen_share_stops_total');
    return this.describe(userId);
  }

  private guard(userId: string, event: 'screen-share:start' | 'screen-share:stop'): void {
    if (this.limiter.take(userId, event)) return;
    this.metrics.increment('events_rate_limited_total');
    throw new HttpException('Bạn thao tác hơi nhanh, chậm lại một chút nhé', 429);
  }

  /** Everything the caller is allowed to know, derived from their own seat. */
  private describe(userId: string): ScreenShareState {
    const session: ScreenShareSession | null = this.screenShare.visibleTo(userId);
    if (!session) {
      return { active: false, session: null, canPublish: true };
    }
    const mine = session.publisherId === userId;
    return {
      active: true,
      session: {
        id: session.id,
        groupId: session.groupId,
        publisherId: session.publisherId,
        publisherName: session.publisherName,
        startedAt: session.startedAt,
      },
      canPublish: mine,
      reason: mine ? undefined : `${session.publisherName} đang chia sẻ màn hình ở bàn này`,
    };
  }
}
