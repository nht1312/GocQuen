import { isInGamingZone } from '@virtual-cafe/shared';

/** Khu Chơi Game's own page — a separate space from the café. */
export const GAMING_ROUTE = '/khu-choi-game';

/** Standing on the floor in front of the banner (not seated) offers the way in. */
export function isNearGamingBanner(self: { x: number; y: number; seatId: string | null } | null): boolean {
  return Boolean(self && !self.seatId && isInGamingZone(self.x, self.y));
}
