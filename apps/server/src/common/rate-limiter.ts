import { RATE_LIMITS, RateLimitedEvent } from '@virtual-cafe/shared';

/**
 * Per-socket token bucket (SPEC 14.1). Cheap enough to run on every inbound
 * event and it keeps a flooding client from costing other people frames.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  /** Returns true when the event is allowed to proceed. */
  take(event: RateLimitedEvent, now = Date.now()): boolean {
    const limit = RATE_LIMITS[event];
    if (!limit) return true;
    const bucket = this.buckets.get(event) ?? { tokens: limit.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
    const tokens = Math.min(limit.capacity, bucket.tokens + elapsedSeconds * limit.refillPerSecond);
    if (tokens < 1) {
      this.buckets.set(event, { tokens, updatedAt: now });
      return false;
    }
    this.buckets.set(event, { tokens: tokens - 1, updatedAt: now });
    return true;
  }
}
