/**
 * Café map definition (SPEC 5.2, 5.3, 12.1 seat_definitions).
 *
 * This is configuration data, not runtime state: seats exist because the map
 * says so, never because somebody sat down. Both the client renderer and the
 * authoritative server read this same definition so collision and seat
 * ownership cannot drift apart.
 */

import { Direction, Point, vectorToDirection } from './iso';

export const MAP_VERSION = 1;
export const MAP_WIDTH = 26;
export const MAP_HEIGHT = 20;

export type ObjectKind =
  | 'counter'
  | 'espresso_machine'
  | 'grinder'
  | 'pastry_case'
  | 'display_shelf'
  | 'bookshelf'
  | 'table_small'
  | 'table_group'
  | 'table_community'
  | 'coffee_table'
  | 'sofa'
  | 'plant_large'
  | 'plant_small'
  | 'trash_bin'
  | 'rug'
  | 'hanging_lamp'
  | 'floor_lamp'
  | 'door_mat';

export type SeatType = 'chair' | 'stool' | 'sofa' | 'armchair';

export type ZoneId =
  | 'entrance'
  | 'counter'
  | 'window_seats'
  | 'solo_tables'
  | 'community_table'
  | 'group_tables'
  | 'lounge';

export interface MapObject {
  id: string;
  kind: ObjectKind;
  /** North-west corner of the footprint, in tile coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Solid objects block movement (SPEC 5.4). */
  solid: boolean;
  /** Draw order nudge for props that sit on top of other furniture. */
  layer?: number;
}

export interface SeatDefinition {
  seatId: string;
  /** Table / conversation group this seat belongs to (SPEC 6.2 voice scope). */
  seatGroupId: string;
  zone: ZoneId;
  x: number;
  y: number;
  facing: Direction;
  seatType: SeatType;
  /** Reserved for ambient NPCs so they never take a seat a guest wants. */
  npcOnly: boolean;
}

export interface Zone {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallDecor {
  id: string;
  /** north is the y=0 wall (upper right on screen), west the x=0 wall. */
  wall: 'north' | 'west';
  kind: 'window' | 'menu_board' | 'art' | 'clock' | 'sign';
  from: number;
  to: number;
}

interface TableSpec {
  id: string;
  zone: ZoneId;
  object: Omit<MapObject, 'id' | 'solid'> & { solid?: boolean };
  seats: Array<{ x: number; y: number; type: SeatType; npcOnly?: boolean }>;
}

const TABLES: TableSpec[] = [
  {
    id: 'counter',
    zone: 'counter',
    object: { kind: 'counter', x: 2, y: 3, w: 1, h: 8 },
    seats: [
      { x: 3, y: 4, type: 'stool' },
      { x: 3, y: 6, type: 'stool' },
      { x: 3, y: 8, type: 'stool' },
    ],
  },
  {
    id: 'window_1',
    zone: 'window_seats',
    object: { kind: 'table_small', x: 6, y: 2, w: 1, h: 1 },
    seats: [
      { x: 6, y: 1, type: 'chair' },
      { x: 7, y: 2, type: 'chair' },
    ],
  },
  {
    id: 'window_2',
    zone: 'window_seats',
    object: { kind: 'table_small', x: 10, y: 2, w: 1, h: 1 },
    seats: [
      { x: 10, y: 1, type: 'chair' },
      { x: 11, y: 2, type: 'chair' },
    ],
  },
  {
    id: 'window_3',
    zone: 'window_seats',
    object: { kind: 'table_small', x: 14, y: 2, w: 1, h: 1 },
    seats: [
      { x: 14, y: 1, type: 'chair' },
      { x: 15, y: 2, type: 'chair' },
    ],
  },
  {
    id: 'window_4',
    zone: 'window_seats',
    object: { kind: 'table_small', x: 18, y: 2, w: 1, h: 1 },
    seats: [
      { x: 18, y: 1, type: 'chair' },
      { x: 19, y: 2, type: 'chair' },
    ],
  },
  {
    id: 'solo_1',
    zone: 'solo_tables',
    object: { kind: 'table_small', x: 5, y: 7, w: 1, h: 1 },
    seats: [{ x: 5, y: 8, type: 'chair' }],
  },
  {
    id: 'solo_2',
    zone: 'solo_tables',
    object: { kind: 'table_small', x: 5, y: 11, w: 1, h: 1 },
    seats: [{ x: 5, y: 12, type: 'chair' }],
  },
  {
    id: 'solo_3',
    zone: 'solo_tables',
    object: { kind: 'table_small', x: 5, y: 15, w: 1, h: 1 },
    seats: [{ x: 5, y: 16, type: 'chair' }],
  },
  {
    id: 'community',
    zone: 'community_table',
    object: { kind: 'table_community', x: 9, y: 6, w: 2, h: 6 },
    seats: [
      { x: 8, y: 6, type: 'chair' },
      { x: 8, y: 8, type: 'chair' },
      { x: 8, y: 10, type: 'chair' },
      { x: 11, y: 6, type: 'chair' },
      { x: 11, y: 8, type: 'chair' },
      { x: 11, y: 10, type: 'chair' },
    ],
  },
  {
    id: 'group_a',
    zone: 'group_tables',
    object: { kind: 'table_group', x: 14, y: 6, w: 2, h: 2 },
    seats: [
      { x: 13, y: 6, type: 'chair' },
      { x: 13, y: 7, type: 'chair' },
      { x: 16, y: 6, type: 'chair' },
      { x: 16, y: 7, type: 'chair' },
    ],
  },
  {
    id: 'group_b',
    zone: 'group_tables',
    object: { kind: 'table_group', x: 14, y: 10, w: 2, h: 2 },
    seats: [
      { x: 13, y: 10, type: 'chair' },
      { x: 13, y: 11, type: 'chair' },
      { x: 16, y: 10, type: 'chair' },
      { x: 16, y: 11, type: 'chair' },
    ],
  },
  {
    id: 'lounge',
    zone: 'lounge',
    object: { kind: 'sofa', x: 20, y: 13, w: 3, h: 1 },
    seats: [
      { x: 20, y: 14, type: 'sofa' },
      { x: 21, y: 14, type: 'sofa' },
      { x: 22, y: 14, type: 'sofa' },
    ],
  },
  {
    id: 'reading_nook',
    zone: 'lounge',
    object: { kind: 'coffee_table', x: 21, y: 16, w: 1, h: 1 },
    seats: [{ x: 19, y: 16, type: 'armchair', npcOnly: true }],
  },
  {
    id: 'window_nook',
    zone: 'window_seats',
    object: { kind: 'coffee_table', x: 23, y: 7, w: 1, h: 1 },
    seats: [{ x: 23, y: 8, type: 'armchair', npcOnly: true }],
  },
];

/** Standalone decoration and props that are not part of a seating group. */
const PROPS: MapObject[] = [
  { id: 'espresso_machine', kind: 'espresso_machine', x: 2, y: 4, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'grinder', kind: 'grinder', x: 2, y: 6, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'pastry_case', kind: 'pastry_case', x: 2, y: 9, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'display_shelf', kind: 'display_shelf', x: 2, y: 12, w: 1, h: 2, solid: true },
  { id: 'bookshelf', kind: 'bookshelf', x: 1, y: 1, w: 1, h: 1, solid: true },
  { id: 'plant_entrance', kind: 'plant_large', x: 1, y: 14, w: 1, h: 1, solid: true },
  { id: 'plant_window', kind: 'plant_large', x: 4, y: 2, w: 1, h: 1, solid: true },
  { id: 'plant_lounge', kind: 'plant_large', x: 22, y: 2, w: 1, h: 1, solid: true },
  { id: 'plant_hall_a', kind: 'plant_small', x: 8, y: 17, w: 1, h: 1, solid: true },
  { id: 'plant_hall_b', kind: 'plant_small', x: 17, y: 17, w: 1, h: 1, solid: true },
  { id: 'trash_bin', kind: 'trash_bin', x: 23, y: 17, w: 1, h: 1, solid: true },
  { id: 'floor_lamp', kind: 'floor_lamp', x: 19, y: 12, w: 1, h: 1, solid: true },
  { id: 'rug_lounge', kind: 'rug', x: 19, y: 13, w: 5, h: 4, solid: false, layer: -1 },
  { id: 'door_mat', kind: 'door_mat', x: 1, y: 16, w: 1, h: 2, solid: false, layer: -1 },
  // Pendant lamps: one above every table, plus the order counter, the
  // Góc Quen corner by the sign and the entrance. Placed so each lamp's centre
  // (x + w/2, y + h/2) sits over the middle of what it lights. Not solid.
  ...(
    [
      // One lamp per area, not per seat: fewer bulbs keep the ceiling calm.
      ['lamp_counter', 2.5, 6.5],
      ['lamp_window_left', 8, 2], // window tables 1 + 2
      ['lamp_window_right', 16, 2], // window tables 3 + 4
      ['lamp_solo', 5, 11], // the three solo tables
      ['lamp_community', 9.5, 8.5],
      ['lamp_group_a', 14.5, 6.5],
      ['lamp_group_b', 14.5, 10.5],
      ['lamp_lounge', 20.5, 14.5], // sofa + reading nook
      ['lamp_goc_quen', 23, 4.5], // the corner under the sign + window nook
      ['lamp_entrance', 1.5, 16.5],
    ] as const
  ).map(
    ([id, x, y]): MapObject => ({ id, kind: 'hanging_lamp', x, y, w: 1, h: 1, solid: false, layer: 8 }),
  ),
];

export const WALL_DECOR: WallDecor[] = [
  { id: 'window_wall', wall: 'north', kind: 'window', from: 4, to: 21 },
  { id: 'cafe_sign', wall: 'north', kind: 'sign', from: 22, to: 24 },
  { id: 'menu_board', wall: 'west', kind: 'menu_board', from: 3, to: 6 },
  { id: 'wall_clock', wall: 'west', kind: 'clock', from: 8, to: 9 },
  { id: 'art_frames', wall: 'west', kind: 'art', from: 11, to: 14 },
];

export const ZONES: Zone[] = [
  { id: 'entrance', label: 'Lối vào', x: 1, y: 14, w: 4, h: 5 },
  { id: 'counter', label: 'Quầy pha chế', x: 1, y: 3, w: 3, h: 10 },
  { id: 'window_seats', label: 'Chỗ ngồi cạnh cửa sổ', x: 5, y: 1, w: 19, h: 4 },
  { id: 'solo_tables', label: 'Bàn đơn', x: 4, y: 6, w: 3, h: 12 },
  { id: 'community_table', label: 'Bàn chung', x: 7, y: 5, w: 5, h: 8 },
  { id: 'group_tables', label: 'Bàn nhóm', x: 12, y: 5, w: 6, h: 8 },
  { id: 'lounge', label: 'Khu thư giãn', x: 18, y: 11, w: 6, h: 7 },
];

/**
 * Human-readable table names (tiếng Việt).
 *
 * A seat group id is an internal key — `group_a`, `window_1`. Those must never
 * reach the screen: use `tableLabel()` wherever a table is named to the user.
 */
export const TABLE_LABELS: Record<string, string> = {
  counter: 'Quầy pha chế',
  window_1: 'Bàn cạnh cửa sổ 1',
  window_2: 'Bàn cạnh cửa sổ 2',
  window_3: 'Bàn cạnh cửa sổ 3',
  window_4: 'Bàn cạnh cửa sổ 4',
  solo_1: 'Bàn đơn 1',
  solo_2: 'Bàn đơn 2',
  solo_3: 'Bàn đơn 3',
  community: 'Bàn chung',
  group_a: 'Bàn nhóm A',
  group_b: 'Bàn nhóm B',
  lounge: 'Khu thư giãn',
  reading_nook: 'Góc đọc sách',
  window_nook: 'Góc cửa sổ',
};

/** Name of a table for display, falling back to a neutral word. */
export function tableLabel(seatGroupId: string | null | undefined): string {
  if (!seatGroupId) return 'bàn của bạn';
  return TABLE_LABELS[seatGroupId] ?? seatGroupId.replace(/_/g, ' ');
}

export const SPAWN_POINT: Point = { x: 2.5, y: 16.5 };
export const SPAWN_SPREAD = 1.2;

export const MAP_OBJECTS: MapObject[] = (() => {
  const objects: MapObject[] = [];
  for (const table of TABLES) {
    objects.push({
      id: `table_${table.id}`,
      solid: table.object.solid ?? true,
      ...table.object,
    } as MapObject);
  }
  objects.push(...PROPS);
  return objects;
})();

/**
 * A seat faces the closest cell of its table rather than the table centroid —
 * on a six-seat community table the centroid would turn everybody sideways.
 */
function facingTowards(
  seat: { x: number; y: number },
  object: { x: number; y: number; w: number; h: number },
): Direction {
  const targetX = Math.min(Math.max(seat.x, object.x), object.x + object.w - 1);
  const targetY = Math.min(Math.max(seat.y, object.y), object.y + object.h - 1);
  return vectorToDirection(targetX - seat.x, targetY - seat.y, 'south');
}

export const SEAT_DEFINITIONS: SeatDefinition[] = (() => {
  const seats: SeatDefinition[] = [];
  for (const table of TABLES) {
    table.seats.forEach((seat, index) => {
      seats.push({
        seatId: `${table.id}:${index + 1}`,
        seatGroupId: table.id,
        zone: table.zone,
        x: seat.x,
        y: seat.y,
        facing: facingTowards(seat, table.object),
        seatType: seat.type,
        npcOnly: seat.npcOnly ?? false,
      });
    });
  }
  return seats;
})();

export const SEATS_BY_ID = new Map(SEAT_DEFINITIONS.map((seat) => [seat.seatId, seat]));

/**
 * Where an avatar actually stands when using a seat.
 *
 * Seat definitions address a tile; positions are continuous world points. The
 * avatar belongs at the centre of that tile, not on its corner — on the corner
 * the collision disc would straddle three neighbouring tiles.
 */
export function seatAnchor(seat: Pick<SeatDefinition, 'x' | 'y'>): Point {
  return { x: seat.x + 0.5, y: seat.y + 0.5 };
}

/**
 * Collision grid. true means the tile is blocked (SPEC 5.4: no walking through
 * walls, tables, the counter or other obstacles).
 */
export const COLLISION_GRID: boolean[][] = (() => {
  const grid: boolean[][] = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, () => false),
  );
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    grid[0][x] = true;
    grid[MAP_HEIGHT - 1][x] = true;
  }
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    grid[y][0] = true;
    grid[y][MAP_WIDTH - 1] = true;
  }
  for (const object of MAP_OBJECTS) {
    if (!object.solid) continue;
    for (let y = object.y; y < object.y + object.h; y += 1) {
      for (let x = object.x; x < object.x + object.w; x += 1) {
        if (grid[y]?.[x] !== undefined) grid[y][x] = true;
      }
    }
  }
  return grid;
})();

export function isBlocked(x: number, y: number): boolean {
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return true;
  return COLLISION_GRID[tileY][tileX];
}

/** Avatars are a disc, so sample the four extremes of their radius. */
export function isWalkable(x: number, y: number, radius = 0.28): boolean {
  return (
    !isBlocked(x - radius, y - radius) &&
    !isBlocked(x + radius, y - radius) &&
    !isBlocked(x - radius, y + radius) &&
    !isBlocked(x + radius, y + radius)
  );
}

export function zoneAt(x: number, y: number): Zone | undefined {
  return ZONES.find(
    (zone) => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h,
  );
}

export function zoneLabelAt(x: number, y: number): string {
  return zoneAt(x, y)?.label ?? 'Trong quán';
}

export function userSeats(): SeatDefinition[] {
  return SEAT_DEFINITIONS.filter((seat) => !seat.npcOnly);
}
