/**
 * Isometric coordinate helpers (SPEC 5.4).
 *
 * World coordinates are the authoritative space: floating point tile units with
 * x growing to the south-east and y growing to the south-west. Screen
 * coordinates are a pure projection and are never persisted or sent over the
 * wire.
 */

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface Point {
  x: number;
  y: number;
}

export type Direction =
  | 'north'
  | 'north_east'
  | 'east'
  | 'south_east'
  | 'south'
  | 'south_west'
  | 'west'
  | 'north_west';

export const DIRECTIONS: Direction[] = [
  'south_east',
  'south',
  'south_west',
  'west',
  'north_west',
  'north',
  'north_east',
  'east',
];

export function worldToScreen(worldX: number, worldY: number): Point {
  return {
    x: (worldX - worldY) * (TILE_WIDTH / 2),
    y: (worldX + worldY) * (TILE_HEIGHT / 2),
  };
}

export function screenToWorld(screenX: number, screenY: number): Point {
  return {
    x: screenY / TILE_HEIGHT + screenX / TILE_WIDTH,
    y: screenY / TILE_HEIGHT - screenX / TILE_WIDTH,
  };
}

/** Depth key for painter's algorithm sorting. Higher draws later (in front). */
export function depthOf(worldX: number, worldY: number, layer = 0): number {
  return (worldX + worldY) * 100 + layer;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Map a world-space movement vector onto one of the eight isometric facings.
 *
 * World +x projects to the lower right of the screen (`south_east`) and world
 * +y to the lower left (`south_west`), so the eight facings are simply the
 * world-space angle quantised into 45 degree steps starting at +x.
 */
export function vectorToDirection(dx: number, dy: number, fallback: Direction = 'south'): Direction {
  if (dx === 0 && dy === 0) return fallback;
  const step = Math.PI / 4;
  const index = ((Math.round(Math.atan2(dy, dx) / step) % 8) + 8) % 8;
  return DIRECTIONS[index] ?? fallback;
}

export function oppositeDirection(direction: Direction): Direction {
  const index = DIRECTIONS.indexOf(direction);
  if (index < 0) return 'south';
  return DIRECTIONS[(index + 4) % DIRECTIONS.length];
}
