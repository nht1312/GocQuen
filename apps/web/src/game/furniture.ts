import { MapObject, SeatDefinition, worldToScreen } from '@virtual-cafe/shared';
import { PALETTE, shade } from './palette';
import { boxColors, ellipseWorld, groundShadow, isoBox, tilePath } from './primitives';

/**
 * Procedural furniture (SPEC 15.1). Each piece is drawn from isometric boxes
 * and a few details rather than a sprite sheet, which keeps the whole café on
 * one consistent camera angle, pivot and palette — the exact failure mode the
 * spec warns about for mixed-source art (SPEC 15.6, 19).
 *
 * Long pieces are drawn one tile at a time. A single painter's-algorithm depth
 * cannot be right for a six-seat table that has people sitting on both sides,
 * so each tile sorts independently; the slices overlap slightly and share a
 * colour, which makes the seams invisible.
 */

type Ctx = CanvasRenderingContext2D;

/** One tile of an object's footprint, in world units. */
export interface Slice {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Slices an object into depth-sortable pieces along its longer axis. */
export function sliceObject(object: MapObject): Slice[] {
  if (object.w <= 1 && object.h <= 1) {
    return [{ x: object.x, y: object.y, w: object.w, h: object.h }];
  }
  const slices: Slice[] = [];
  if (object.h >= object.w) {
    for (let i = 0; i < object.h; i += 1) {
      slices.push({ x: object.x, y: object.y + i, w: object.w, h: 1 });
    }
  } else {
    for (let i = 0; i < object.w; i += 1) {
      slices.push({ x: object.x + i, y: object.y, w: 1, h: object.h });
    }
  }
  return slices;
}

/** Slices overlap a little so adjacent faces never show a hairline seam. */
function bleed(slice: Slice, amount = 0.04): Slice {
  return {
    x: slice.x - amount,
    y: slice.y - amount,
    w: slice.w + amount * 2,
    h: slice.h + amount * 2,
  };
}

function contains(slice: Slice, x: number, y: number): boolean {
  return x >= slice.x && x < slice.x + slice.w && y >= slice.y && y < slice.y + slice.h;
}

function cup(ctx: Ctx, x: number, y: number, lift: number): void {
  ellipseWorld(ctx, x, y, lift, 4.5, 2.4, shade(PALETTE.ceramic, -0.12));
  ellipseWorld(ctx, x, y, lift + 3, 4.5, 2.4, PALETTE.ceramic);
  ellipseWorld(ctx, x, y, lift + 3.4, 3, 1.5, '#5b3a22');
}

function laptop(ctx: Ctx, x: number, y: number, lift: number): void {
  const point = worldToScreen(x, y);
  ctx.fillStyle = PALETTE.metal;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y - lift, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.metalDark;
  ctx.beginPath();
  ctx.moveTo(point.x - 8, point.y - lift - 1);
  ctx.lineTo(point.x + 2, point.y - lift - 5);
  ctx.lineTo(point.x + 2, point.y - lift - 16);
  ctx.lineTo(point.x - 8, point.y - lift - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 215, 225, 0.75)';
  ctx.beginPath();
  ctx.moveTo(point.x - 6.5, point.y - lift - 3);
  ctx.lineTo(point.x + 1, point.y - lift - 6);
  ctx.lineTo(point.x + 1, point.y - lift - 14.5);
  ctx.lineTo(point.x - 6.5, point.y - lift - 11.5);
  ctx.closePath();
  ctx.fill();
}

function foliage(ctx: Ctx, x: number, y: number, lift: number, scale: number): void {
  const blobs = [
    { dx: 0, dy: -scale * 1.1, r: scale * 0.95, c: PALETTE.plantLight },
    { dx: -scale * 0.7, dy: -scale * 0.5, r: scale * 0.8, c: PALETTE.plant },
    { dx: scale * 0.7, dy: -scale * 0.45, r: scale * 0.75, c: PALETTE.plant },
    { dx: scale * 0.15, dy: -scale * 1.8, r: scale * 0.6, c: PALETTE.plantDark },
  ];
  const point = worldToScreen(x, y);
  for (const blob of blobs) {
    ctx.fillStyle = blob.c;
    ctx.beginPath();
    ctx.ellipse(point.x + blob.dx, point.y - lift + blob.dy, blob.r, blob.r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tableSlice(ctx: Ctx, slice: Slice, height: number, base: string): void {
  groundShadow(ctx, slice.x + slice.w / 2, slice.y + slice.h / 2, 15 * slice.w, 8 * slice.h, 0.16);
  const body = bleed(slice);
  isoBox(ctx, body.x + 0.2, body.y + 0.2, body.w - 0.4, body.h - 0.4, height - 7, boxColors(PALETTE.walnutSide));
  isoBox(ctx, body.x, body.y, body.w, body.h, height, boxColors(base));
}

export function drawObjectSlice(
  ctx: Ctx,
  object: MapObject,
  slice: Slice,
  time: number,
  reducedMotion: boolean,
): void {
  const cx = slice.x + slice.w / 2;
  const cy = slice.y + slice.h / 2;
  const body = bleed(slice);

  switch (object.kind) {
    case 'rug': {
      tilePath(ctx, object.x + 0.1, object.y + 0.1, object.w - 0.2, object.h - 0.2);
      ctx.fillStyle = 'rgba(150, 116, 86, 0.4)';
      ctx.fill();
      tilePath(ctx, object.x + 0.4, object.y + 0.4, object.w - 0.8, object.h - 0.8);
      ctx.strokeStyle = 'rgba(214, 190, 157, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'door_mat': {
      tilePath(ctx, object.x + 0.15, object.y + 0.15, object.w - 0.3, object.h - 0.3);
      ctx.fillStyle = 'rgba(92, 72, 56, 0.5)';
      ctx.fill();
      break;
    }
    case 'counter': {
      groundShadow(ctx, cx, cy, 17, 10, 0.18);
      isoBox(ctx, body.x, body.y, body.w, body.h, 52, boxColors(PALETTE.woodSide));
      isoBox(ctx, body.x - 0.07, body.y - 0.07, body.w + 0.14, body.h + 0.14, 58, {
        top: PALETTE.floorStone,
        left: shade(PALETTE.floorStone, -0.22),
        right: shade(PALETTE.floorStone, -0.09),
      });
      break;
    }
    case 'espresso_machine': {
      isoBox(ctx, slice.x + 0.12, slice.y + 0.12, 0.76, 0.76, 92, {
        top: shade(PALETTE.metal, 0.18),
        left: PALETTE.metalDark,
        right: PALETTE.metal,
      });
      isoBox(ctx, slice.x + 0.22, slice.y + 0.22, 0.56, 0.56, 100, boxColors('#8c3f2a'));
      if (!reducedMotion) {
        // Steam curling off the group head (SPEC 15.5).
        const point = worldToScreen(cx, cy);
        ctx.save();
        for (let i = 0; i < 3; i += 1) {
          const phase = (time / 1800 + i * 0.33) % 1;
          ctx.globalAlpha = 0.26 * (1 - phase);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(
            point.x + Math.sin(phase * 6 + i) * 5,
            point.y - 104 - phase * 34,
            5 + phase * 7,
            3.5 + phase * 5,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'grinder': {
      isoBox(ctx, slice.x + 0.3, slice.y + 0.3, 0.4, 0.4, 74, boxColors(PALETTE.metalDark));
      ellipseWorld(ctx, cx, cy, 78, 7, 4, shade(PALETTE.metal, 0.1));
      break;
    }
    case 'pastry_case': {
      isoBox(ctx, slice.x + 0.12, slice.y + 0.12, 0.76, 0.76, 66, {
        top: 'rgba(206, 226, 232, 0.82)',
        left: 'rgba(150, 178, 188, 0.78)',
        right: 'rgba(178, 202, 210, 0.78)',
      });
      ellipseWorld(ctx, cx - 0.12, cy, 70, 5, 3, '#d9a05b');
      ellipseWorld(ctx, cx + 0.14, cy, 70, 5, 3, '#c98f52');
      break;
    }
    case 'display_shelf':
    case 'bookshelf': {
      groundShadow(ctx, cx, cy, 15, 9, 0.18);
      isoBox(ctx, body.x, body.y, body.w, body.h, 104, boxColors(PALETTE.walnutSide));
      for (let i = 0; i < 3; i += 1) {
        const lift = 34 + i * 26;
        for (let j = 0; j < 3; j += 1) {
          const point = worldToScreen(slice.x + 0.25 + j * 0.25, cy);
          ctx.fillStyle = ['#8c5a3c', '#6b7355', '#a9743f', '#5a6475'][(i + j) % 4];
          ctx.fillRect(point.x - 3, point.y - lift - 15, 6, 15);
        }
      }
      break;
    }
    case 'table_small':
    case 'coffee_table': {
      const height = object.kind === 'coffee_table' ? 28 : 40;
      tableSlice(ctx, slice, height, PALETTE.woodSide);
      if (object.kind === 'table_small') cup(ctx, cx - 0.12, cy, height + 2);
      break;
    }
    case 'table_group': {
      tableSlice(ctx, slice, 42, PALETTE.woodSide);
      if (contains(slice, object.x, object.y)) cup(ctx, object.x + 0.55, object.y + 0.5, 44);
      if (contains(slice, object.x + 1, object.y + 1)) laptop(ctx, object.x + 1.4, object.y + 1.4, 44);
      break;
    }
    case 'table_community': {
      tableSlice(ctx, slice, 44, PALETTE.walnutSide);
      // One workstation every other tile along the table.
      const row = slice.y - object.y;
      if (row % 2 === 0) {
        laptop(ctx, object.x + 0.45, slice.y + 0.5, 46);
        cup(ctx, object.x + 1.5, slice.y + 0.6, 46);
      }
      break;
    }
    case 'sofa': {
      groundShadow(ctx, cx, cy, 17, 9, 0.18);
      isoBox(ctx, body.x, body.y, body.w, 0.44, 62, boxColors(PALETTE.sofaSide));
      isoBox(ctx, body.x, body.y + 0.32, body.w, 0.68, 30, boxColors(PALETTE.sofaTop));
      isoBox(ctx, slice.x + 0.12, slice.y + 0.44, 0.76, 0.44, 38, {
        top: shade(PALETTE.fabricTop, 0.06),
        left: shade(PALETTE.fabricSide, -0.12),
        right: PALETTE.fabricSide,
      });
      break;
    }
    case 'plant_large':
    case 'plant_small': {
      const scale = object.kind === 'plant_large' ? 15 : 10;
      groundShadow(ctx, cx, cy, scale, scale * 0.5, 0.2);
      isoBox(ctx, slice.x + 0.3, slice.y + 0.3, 0.4, 0.4, scale * 1.1, boxColors(PALETTE.pot));
      foliage(ctx, cx, cy, scale * 1.2, scale);
      break;
    }
    case 'planter': {
      isoBox(ctx, body.x + 0.05, body.y + 0.12, body.w - 0.1, body.h - 0.24, 26, boxColors(PALETTE.woodSide));
      ellipseWorld(ctx, cx, cy, 36, 16, 9, PALETTE.plant);
      ellipseWorld(ctx, cx + 0.2, cy, 44, 11, 7, PALETTE.plantLight);
      break;
    }
    case 'trash_bin': {
      isoBox(ctx, slice.x + 0.32, slice.y + 0.32, 0.36, 0.36, 32, boxColors(PALETTE.metalDark));
      break;
    }
    case 'floor_lamp': {
      isoBox(ctx, slice.x + 0.44, slice.y + 0.44, 0.12, 0.12, 92, boxColors(PALETTE.metalDark));
      ellipseWorld(ctx, cx, cy, 100, 14, 9, '#e8c893');
      ellipseWorld(ctx, cx, cy, 96, 14, 7, 'rgba(255, 214, 150, 0.5)');
      break;
    }
    case 'hanging_lamp': {
      const point = worldToScreen(cx, cy);
      // Warm pool of light on the floor first, then the fixture above it.
      const glow = ctx.createRadialGradient(point.x, point.y, 2, point.x, point.y, 78);
      glow.addColorStop(0, 'rgba(255, 206, 140, 0.2)');
      glow.addColorStop(1, 'rgba(255, 206, 140, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, 78, 39, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(60, 46, 36, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 210);
      ctx.lineTo(point.x, point.y - 152);
      ctx.stroke();
      ctx.fillStyle = '#a8663c';
      ctx.beginPath();
      ctx.moveTo(point.x - 16, point.y - 138);
      ctx.lineTo(point.x + 16, point.y - 138);
      ctx.lineTo(point.x + 8, point.y - 154);
      ctx.lineTo(point.x - 8, point.y - 154);
      ctx.closePath();
      ctx.fill();
      ellipseWorld(ctx, cx, cy, 136, 15, 5, '#f2d6a6');
      break;
    }
    default:
      break;
  }
}

/** Chairs come from the seat definitions, so every seat is visibly sittable. */
export function drawSeat(ctx: Ctx, seat: SeatDefinition, occupied: boolean): void {
  if (seat.seatType === 'sofa') return; // drawn as part of the sofa itself

  const base = occupied ? shade(PALETTE.woodSide, -0.14) : PALETTE.woodSide;
  groundShadow(ctx, seat.x + 0.5, seat.y + 0.5, 11, 6, 0.14);

  if (seat.seatType === 'stool') {
    isoBox(ctx, seat.x + 0.3, seat.y + 0.3, 0.4, 0.4, 36, boxColors(base));
    return;
  }
  if (seat.seatType === 'armchair') {
    isoBox(ctx, seat.x + 0.1, seat.y + 0.1, 0.8, 0.8, 26, boxColors(PALETTE.fabricSide));
    isoBox(ctx, seat.x + 0.1, seat.y + 0.1, 0.8, 0.26, 54, boxColors(PALETTE.sofaSide));
    return;
  }

  isoBox(ctx, seat.x + 0.2, seat.y + 0.2, 0.6, 0.6, 22, boxColors(base));
  // The back goes on the side away from the table.
  const vertical = seat.facing === 'north_east' || seat.facing === 'south_west';
  const away = seat.facing === 'north_west' || seat.facing === 'north_east' ? 0.64 : 0.12;
  const backColour = boxColors(shade(base, -0.1));
  if (vertical) {
    isoBox(ctx, seat.x + 0.16, seat.y + away, 0.68, 0.24, 40, backColour);
  } else {
    isoBox(ctx, seat.x + away, seat.y + 0.16, 0.24, 0.68, 40, backColour);
  }
}

/** Highlight on the seat the player can take right now (SPEC 10.1). */
export function drawSeatHighlight(ctx: Ctx, seat: SeatDefinition, pulse: number): void {
  tilePath(ctx, seat.x + 0.08, seat.y + 0.08, 0.84, 0.84);
  ctx.fillStyle = `rgba(197, 139, 90, ${0.12 + pulse * 0.1})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(221, 168, 115, ${0.5 + pulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}
