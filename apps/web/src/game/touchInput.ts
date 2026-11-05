/**
 * Joystick deflection to a world-space walking direction.
 *
 * The stick is screen-space — a thumb pushes towards the top of the display,
 * not towards -y in world coordinates — so it goes through the same isometric
 * mapping the keyboard does: screen right is world (+x, -y) and screen down
 * is world (+x, +y). Unlike the keyboard it keeps its magnitude, so a
 * half-deflected thumb walks at half speed.
 */

export interface Deflection {
  /** -1 (left) to 1 (right). */
  x: number;
  /** -1 (up) to 1 (down). */
  y: number;
}

export interface WorldIntent {
  dx: number;
  dy: number;
}

const STILL: WorldIntent = { dx: 0, dy: 0 };

export function joystickToWorld(deflection: Deflection | null | undefined): WorldIntent {
  if (!deflection) return STILL;

  const push = Math.min(Math.hypot(deflection.x, deflection.y), 1);
  if (!(push > 0)) return STILL;

  const dx = deflection.x + deflection.y;
  const dy = deflection.y - deflection.x;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return STILL;

  return { dx: (dx / length) * push, dy: (dy / length) * push };
}
