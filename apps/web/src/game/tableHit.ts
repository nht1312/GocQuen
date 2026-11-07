import { MAP_OBJECTS, SEAT_DEFINITIONS } from '@virtual-cafe/shared';

/** True when a world point is on the given table or one of its seats. */
export function onTable(groupId: string, x: number, y: number): boolean {
  const table = MAP_OBJECTS.find((object) => object.id === `table_${groupId}`);
  if (table && x >= table.x && x < table.x + table.w && y >= table.y && y < table.y + table.h) return true;
  return SEAT_DEFINITIONS.some(
    (seat) => seat.seatGroupId === groupId && x >= seat.x && x < seat.x + 1 && y >= seat.y && y < seat.y + 1,
  );
}

export function tableCentre(groupId: string): { x: number; y: number } | null {
  const table = MAP_OBJECTS.find((object) => object.id === `table_${groupId}`);
  if (!table) return null;
  return { x: table.x + table.w / 2, y: table.y + table.h / 2 };
}
