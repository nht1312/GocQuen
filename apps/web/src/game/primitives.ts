import { worldToScreen } from '@virtual-cafe/shared';
import { PALETTE, shade } from './palette';

/** Drawing primitives in isometric space. All inputs are world tile units. */

export function tilePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w = 1,
  h = 1,
  lift = 0,
): void {
  const corners = [
    worldToScreen(x, y),
    worldToScreen(x + w, y),
    worldToScreen(x + w, y + h),
    worldToScreen(x, y + h),
  ];
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y - lift);
  for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y - lift);
  ctx.closePath();
}

export interface BoxColors {
  top: string;
  left: string;
  right: string;
}

export function boxColors(base: string): BoxColors {
  // Light falls from the window wall at the top right of the screen.
  return { top: shade(base, 0.16), right: base, left: shade(base, -0.22) };
}

/**
 * An isometric box standing on the footprint (x, y, w, h) with pixel height.
 * Faces are painted back to front so the silhouette reads cleanly.
 */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  height: number,
  colors: BoxColors,
): void {
  const a = worldToScreen(x, y);
  const b = worldToScreen(x + w, y);
  const c = worldToScreen(x + w, y + h);
  const d = worldToScreen(x, y + h);

  // Left face (towards the lower left of the screen).
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(d.x, d.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(c.x, c.y - height);
  ctx.lineTo(d.x, d.y - height);
  ctx.closePath();
  ctx.fill();

  // Right face.
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(c.x, c.y - height);
  ctx.lineTo(b.x, b.y - height);
  ctx.closePath();
  ctx.fill();

  // Top face.
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - height);
  ctx.lineTo(b.x, b.y - height);
  ctx.lineTo(c.x, c.y - height);
  ctx.lineTo(d.x, d.y - height);
  ctx.closePath();
  ctx.fill();
}

/** Soft contact shadow under furniture and avatars. */
export function groundShadow(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  radiusX = 16,
  radiusY = 8,
  alpha = 0.22,
): void {
  const point = worldToScreen(worldX, worldY);
  ctx.save();
  ctx.fillStyle = `rgba(58, 40, 28, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function ellipseWorld(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  lift: number,
  radiusX: number,
  radiusY: number,
  fill: string,
): void {
  const point = worldToScreen(worldX, worldY);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y - lift, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}

export { PALETTE };
