/** Tuning values shared by the authoritative server and the predicting client. */

/** Tiles per second. The server clamps movement to this plus a tolerance. */
export const WALK_SPEED = 3.2;

/** Allowance for latency jitter when validating client movement (SPEC 11.4). */
export const SPEED_TOLERANCE = 1.6;

/** How close a player must be to a seat before they may sit (SPEC 5.3). */
export const SEAT_INTERACT_RADIUS = 1.6;

/** Avatar collision radius in tiles. */
export const AVATAR_RADIUS = 0.28;

/** Client send rate for movement updates. */
export const MOVE_SEND_HZ = 15;

/**
 * Server broadcast rate for position changes (SPEC 11.3).
 *
 * Movement is relayed on a fixed tick rather than once per inbound message.
 * A per-event relay costs N x (N-1) x MOVE_SEND_HZ frames per second, so the
 * work grows quadratically with occupancy; batching makes it N x WORLD_TICK_HZ
 * frames carrying the same information. Measured at 25 guests: 8,100 frames/s
 * before, 375 after.
 *
 * Keep this at or below MOVE_SEND_HZ — ticking faster than clients send only
 * emits duplicate positions.
 */
export const WORLD_TICK_HZ = 15;
export const WORLD_TICK_MS = Math.round(1000 / WORLD_TICK_HZ);

/** Token bucket limits per socket (SPEC 14.1). */
export const RATE_LIMITS = {
  'player:move': { capacity: 40, refillPerSecond: 25 },
  'player:state': { capacity: 10, refillPerSecond: 3 },
  'player:sit': { capacity: 8, refillPerSecond: 2 },
  'player:stand': { capacity: 8, refillPerSecond: 2 },
  'voice:join': { capacity: 6, refillPerSecond: 1 },
  'voice:leave': { capacity: 6, refillPerSecond: 1 },
  'voice:state': { capacity: 10, refillPerSecond: 3 },
  'chat:send': { capacity: 6, refillPerSecond: 1 },
  // Starting and stopping are cheap for the server but expensive for the
  // table, which sees a panel appear and vanish each time.
  'screen-share:start': { capacity: 5, refillPerSecond: 0.2 },
  'screen-share:stop': { capacity: 5, refillPerSecond: 0.2 },
  'session:ping': { capacity: 6, refillPerSecond: 1 },
} as const;

export type RateLimitedEvent = keyof typeof RATE_LIMITS;

/** Audio layers with independent volume control (SPEC 6.1, 6.4). */
export const AUDIO_LAYERS = ['music', 'ambience', 'weather', 'crowd', 'voice', 'ui'] as const;
export type AudioLayer = (typeof AUDIO_LAYERS)[number];

export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  weather: number;
  crowd: number;
  voice: number;
  ui: number;
  muteAll: boolean;
  reducedMotion: boolean;
  focusMode: boolean;
  /** Enhanced (Krisp) noise cancellation on our own microphone. */
  noiseCancellation: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.7,
  music: 0.45,
  ambience: 0.55,
  weather: 0.4,
  crowd: 0.35,
  voice: 0.9,
  ui: 0.5,
  muteAll: false,
  reducedMotion: false,
  focusMode: false,
  noiseCancellation: true,
};

/** Heartbeat/timeout budget (SPEC 16.2). */
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * Display name bounds.
 *
 * Two characters is the shortest thing that reads as a name; 24 is what a
 * name plate can hold over an avatar without covering the person next to
 * them.
 */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

/**
 * The one rule for turning typed input into a usable display name.
 *
 * Shared deliberately: the landing page has to tell someone their name is too
 * short *before* they walk in, and the server has to enforce the same thing
 * when the request arrives. Two copies of this rule would eventually disagree,
 * and the visible symptom would be a name silently replaced by a random one.
 *
 * Control characters are stripped rather than rejected — zero-width and
 * directional marks can be used to impersonate another guest's name plate or
 * break the layout around it, and someone pasting a name should not have to
 * know that.
 *
 * Returns null when nothing usable is left, which is the caller's cue to fall
 * back (server) or to refuse entry (client).
 */
export function normaliseDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[\p{C}]/gu, '')
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
  return cleaned.length >= DISPLAY_NAME_MIN ? cleaned : null;
}

export const STORAGE_KEYS = {
  session: 'virtual-cafe.session',
  /** The name typed on the landing page, read once on the way in. */
  pendingName: 'virtual-cafe.pending-name',
  audio: 'virtual-cafe.audio',
  onboarding: 'virtual-cafe.onboarding-complete',
  mutedUsers: 'virtual-cafe.muted-users',
} as const;
