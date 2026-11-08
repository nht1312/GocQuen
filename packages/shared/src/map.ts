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
  | 'door_mat'
  | 'planter';

export type SeatType = 'chair' | 'stool' | 'sofa' | 'armchair';

export type ZoneId =
  | 'entrance'
  | 'counter'
  | 'window_seats'
  | 'solo_tables'
  | 'community_table'
  | 'group_tables'
  | 'lounge'
  | 'gaming';

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
  kind: 'window' | 'menu_board' | 'art' | 'clock' | 'sign' | 'neon';
  from: number;
  to: number;
}

interface TableSpec {
  id: string;
  zone: ZoneId;
  object: Omit<MapObject, 'id' | 'solid'> & { solid?: boolean };
  seats: Array<{ x: number; y: number; type: SeatType; npcOnly?: boolean }>;
}

/**
 * Layout v3 — spaced out, every table with at least one clear tile around it:
 *
 *     01234567890123456789012345
 *   0 ######WWWWWWWWWWW#NNNNNNN#   W window · N Khu Chơi Game banner
 *   1 #..BBPc..c..c..c..P.....P#
 *   2 #.....Tc.Tc.Tc.Tc........#   window tables · floor in front of banner
 *   3 #.Q......................#
 *   4 #.Qs.....................#
 *   5 #.Q.....c.c.c.....cTTc...#   counter · community · group A
 *   6 #.Qs....TTTTTT....cTTc...#
 *   7 #.Q.....TTTTTT...........#
 *   8 #.Qs....c.c.c...........p#
 *   9 #.Q......................#
 *  10 #.R....................Tc#   solo tables
 *  11 #K~~~~........c.c........#
 *  12 #K~a~~.~~~~~..TTTT.......#   reading nook · lounge · group B
 *  13 #K~k~~.~FFFL..TTTT.....Tc#
 *  14 #P~a~~.~SSS~..c.c..ka....#   quiet corner
 *  15 #~~~~~.~~~~~.............#
 *  16 #D*....~kkk~...........Tc#   entrance
 *  18 #............p....====...#   planter
 *
 * Seat group ids are unchanged (tests and tools rely on them). Khu Chơi Game
 * is a separate space (/khu-choi-game); the café keeps only its banner.
 */
const TABLES: TableSpec[] = [
  {
    id: 'counter',
    zone: 'counter',
    object: { kind: 'counter', x: 2, y: 3, w: 1, h: 7 },
    seats: [
      { x: 3, y: 4, type: 'stool' },
      { x: 3, y: 6, type: 'stool' },
      { x: 3, y: 8, type: 'stool' },
    ],
  },
  ...([
    ['window_1', 6],
    ['window_2', 9],
    ['window_3', 12],
    ['window_4', 15],
  ] as const).map(
    ([id, x]): TableSpec => ({
      id,
      zone: 'window_seats',
      object: { kind: 'table_small', x, y: 2, w: 1, h: 1 },
      seats: [
        { x, y: 1, type: 'chair' },
        { x: x + 1, y: 2, type: 'chair' },
      ],
    }),
  ),
  {
    id: 'group_a',
    zone: 'group_tables',
    object: { kind: 'table_group', x: 19, y: 5, w: 2, h: 2 },
    seats: [
      { x: 18, y: 5, type: 'chair' },
      { x: 18, y: 6, type: 'chair' },
      { x: 21, y: 5, type: 'chair' },
      { x: 21, y: 6, type: 'chair' },
    ],
  },
  {
    id: 'community',
    zone: 'community_table',
    object: { kind: 'table_community', x: 8, y: 6, w: 6, h: 2 },
    seats: [
      { x: 8, y: 5, type: 'chair' },
      { x: 10, y: 5, type: 'chair' },
      { x: 12, y: 5, type: 'chair' },
      { x: 8, y: 8, type: 'chair' },
      { x: 10, y: 8, type: 'chair' },
      { x: 12, y: 8, type: 'chair' },
    ],
  },
  {
    id: 'group_b',
    zone: 'group_tables',
    object: { kind: 'table_group', x: 14, y: 12, w: 4, h: 2 },
    seats: [
      { x: 14, y: 11, type: 'chair' },
      { x: 16, y: 11, type: 'chair' },
      { x: 14, y: 14, type: 'chair' },
      { x: 16, y: 14, type: 'chair' },
    ],
  },
  ...([
    ['solo_1', 10],
    ['solo_2', 13],
    ['solo_3', 16],
  ] as const).map(
    ([id, y]): TableSpec => ({
      id,
      zone: 'solo_tables',
      object: { kind: 'table_small', x: 23, y, w: 1, h: 1 },
      seats: [{ x: 24, y, type: 'chair' }],
    }),
  ),
  {
    id: 'lounge',
    zone: 'lounge',
    object: { kind: 'sofa', x: 8, y: 13, w: 3, h: 1 },
    seats: [
      { x: 8, y: 14, type: 'sofa' },
      { x: 9, y: 14, type: 'sofa' },
      { x: 10, y: 14, type: 'sofa' },
    ],
  },
  {
    id: 'reading_nook',
    zone: 'lounge',
    object: { kind: 'coffee_table', x: 3, y: 13, w: 1, h: 1 },
    seats: [
      { x: 3, y: 12, type: 'armchair', npcOnly: true },
      { x: 3, y: 14, type: 'armchair', npcOnly: true },
    ],
  },
  {
    id: 'window_nook',
    zone: 'group_tables',
    object: { kind: 'coffee_table', x: 19, y: 14, w: 1, h: 1 },
    seats: [{ x: 20, y: 14, type: 'armchair', npcOnly: true }],
  },
];

/** Khu Chơi Game: the walled room in the north-east corner. */
/** Floor in front of the Khu Chơi Game banner: standing here offers the way in. */
export const GAMING_ZONE = { x: 17, y: 1, w: 8, h: 3 } as const;
/** Stations on the /khu-choi-game page (reserved there, not in the café). */
export const GAMING_CAPACITY = 6;

export function isInGamingZone(x: number, y: number): boolean {
  return (
    x >= GAMING_ZONE.x &&
    x < GAMING_ZONE.x + GAMING_ZONE.w &&
    y >= GAMING_ZONE.y &&
    y < GAMING_ZONE.y + GAMING_ZONE.h
  );
}

/** Standalone decoration and props that are not part of a seating group. */
const PROPS: MapObject[] = [
  { id: 'espresso_machine', kind: 'espresso_machine', x: 2, y: 4, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'grinder', kind: 'grinder', x: 2, y: 6, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'pastry_case', kind: 'pastry_case', x: 2, y: 9, w: 1, h: 1, solid: true, layer: 1 },
  { id: 'bookshelf', kind: 'bookshelf', x: 3, y: 1, w: 2, h: 1, solid: true },
  { id: 'low_shelf', kind: 'display_shelf', x: 1, y: 11, w: 1, h: 3, solid: true },
  { id: 'plant_bar', kind: 'plant_large', x: 5, y: 1, w: 1, h: 1, solid: true },
  { id: 'plant_nook', kind: 'plant_large', x: 1, y: 14, w: 1, h: 1, solid: true },
  { id: 'plant_hall', kind: 'plant_small', x: 13, y: 18, w: 1, h: 1, solid: true },
  { id: 'plant_solo', kind: 'plant_small', x: 24, y: 8, w: 1, h: 1, solid: true },
  { id: 'trash_bin', kind: 'trash_bin', x: 2, y: 10, w: 1, h: 1, solid: true },
  { id: 'floor_lamp', kind: 'floor_lamp', x: 11, y: 13, w: 1, h: 1, solid: true },
  { id: 'lounge_coffee', kind: 'coffee_table', x: 8, y: 16, w: 3, h: 1, solid: true },
  { id: 'planter', kind: 'planter', x: 18, y: 18, w: 4, h: 1, solid: true },
  { id: 'rug_nook', kind: 'rug', x: 1, y: 11, w: 5, h: 5, solid: false, layer: -1 },
  { id: 'rug_lounge', kind: 'rug', x: 7, y: 12, w: 5, h: 6, solid: false, layer: -1 },
  { id: 'door_mat', kind: 'door_mat', x: 1, y: 16, w: 1, h: 2, solid: false, layer: -1 },
  // Khu Chơi Game is not in the café: only its neon banner hangs on the
  // north wall. Walking up to it offers a way to its own page.
  { id: 'plant_banner_a', kind: 'plant_large', x: 18, y: 1, w: 1, h: 1, solid: true },
  { id: 'plant_banner_b', kind: 'plant_large', x: 24, y: 1, w: 1, h: 1, solid: true },
  // Pendant lamps, one per area. Each lamp's centre (x + 0.5, y + 0.5) sits
  // over what it lights. Not solid.
  ...(
    [
      ['lamp_counter', 2.5, 6.5],
      ['lamp_window_left', 7.5, 1.5],
      ['lamp_window_right', 13.5, 1.5],
      ['lamp_group_a', 19.5, 5.5],
      ['lamp_community', 10.5, 6.5],
      ['lamp_group_b', 15.5, 12.5],
      ['lamp_solo', 23, 13],
      ['lamp_lounge', 9, 14.5],
      ['lamp_nook', 3, 13],
      ['lamp_quiet', 19, 14],
      ['lamp_entrance', 1.5, 16.5],
    ] as const
  ).map(
    ([id, x, y]): MapObject => ({ id, kind: 'hanging_lamp', x, y, w: 1, h: 1, solid: false, layer: 8 }),
  ),
];

export const WALL_DECOR: WallDecor[] = [
  { id: 'cafe_sign', wall: 'north', kind: 'sign', from: 1, to: 5 },
  { id: 'window_wall', wall: 'north', kind: 'window', from: 6, to: 17 },
  { id: 'gaming_neon', wall: 'north', kind: 'neon', from: 18, to: 25 },
  { id: 'menu_board', wall: 'west', kind: 'menu_board', from: 3, to: 6 },
  { id: 'wall_clock', wall: 'west', kind: 'clock', from: 8, to: 9 },
  { id: 'art_frames', wall: 'west', kind: 'art', from: 11, to: 14 },
];

export const ZONES: Zone[] = [
  { id: 'gaming', label: 'Trước Khu Chơi Game', x: 17, y: 1, w: 8, h: 3 },
  { id: 'counter', label: 'Quầy pha chế', x: 1, y: 1, w: 4, h: 10 },
  { id: 'window_seats', label: 'Chỗ ngồi cạnh cửa sổ', x: 5, y: 1, w: 12, h: 2 },
  { id: 'entrance', label: 'Lối vào', x: 1, y: 16, w: 3, h: 3 },
  { id: 'lounge', label: 'Khu thư giãn', x: 1, y: 11, w: 11, h: 7 },
  { id: 'community_table', label: 'Bàn chung', x: 6, y: 4, w: 9, h: 6 },
  { id: 'solo_tables', label: 'Bàn đơn', x: 22, y: 9, w: 3, h: 9 },
  { id: 'group_tables', label: 'Bàn nhóm', x: 5, y: 3, w: 17, h: 16 },
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
  window_nook: 'Góc yên tĩnh',
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
