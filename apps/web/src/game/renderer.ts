import {
  MAP_HEIGHT,
  MAP_OBJECTS,
  MAP_WIDTH,
  SEAT_DEFINITIONS,
  SeatDefinition,
  TILE_HEIGHT,
  WALL_DECOR,
  screenToWorld,
  worldToScreen,
} from '@virtual-cafe/shared';
import { AvatarRenderState, drawAvatar, drawNamePlate } from './avatar';
import { Slice, drawObjectSlice, drawSeat, drawSeatHighlight, sliceObject } from './furniture';
import { PALETTE, WALL_HEIGHT, hash2, shade } from './palette';
import { tilePath } from './primitives';
import { SCENE_MARGIN, sceneExtent, worldScaleFor } from './viewport';
import type { WorldAmbience } from '@/world/ambience';

/** Name painted on the north-wall sign. */
const SIGN_TEXT = 'GÓC QUEN';

export interface SceneInput {
  avatars: AvatarRenderState[];
  /** seatId -> occupied. */
  occupancy: Map<string, boolean>;
  highlightSeatId: string | null;
  /** Milliseconds since the scene started, for ambient animation. */
  time: number;
  reducedMotion: boolean;
  cameraX: number;
  cameraY: number;
  /** Real-world time and weather; absent or not live = the original rainy afternoon. */
  ambience?: WorldAmbience | null;
}

/** What the scene draws with, resolved once per frame. */
interface Sky {
  daylight: number;
  rain: number;
  cloud: number;
  storm: boolean;
}

const DEFAULT_SKY: Sky = { daylight: 1, rain: 1, cloud: 0.6, storm: false };

function skyOf(ambience: WorldAmbience | null | undefined): Sky {
  if (!ambience?.live) return DEFAULT_SKY;
  return {
    daylight: ambience.daylight,
    rain: ambience.rain,
    cloud: ambience.cloud,
    storm: ambience.weather === 'storm',
  };
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 0xff) * (1 - t) + ((pb >> shift) & 0xff) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

interface Drawable {
  depth: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** Entities tie-break in front of the furniture tile they stand beside. */
const ENTITY_DEPTH_BIAS = 1.5;

function objectDepth(slice: Slice, layer: number): number {
  return slice.x + slice.w + slice.y + slice.h + layer * 0.01;
}

export class CafeRenderer {
  private floor: HTMLCanvasElement | null = null;
  private floorOrigin = { x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private scale = 1;
  /** Viewport measured in world pixels — CSS pixels divided by the zoom. */
  private viewWidth = 0;
  private viewHeight = 0;
  private sky: Sky = DEFAULT_SKY;

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.scale = worldScaleFor(width, height);
    this.viewWidth = width / this.scale;
    this.viewHeight = height / this.scale;
  }

  /** Floor and static ground decals are painted once into an offscreen canvas. */
  private buildFloor(): HTMLCanvasElement {
    const topLeft = worldToScreen(0, MAP_HEIGHT);
    const bottomRight = worldToScreen(MAP_WIDTH, 0);
    const originX = -topLeft.x + 8;
    const originY = 8;
    const width = Math.ceil(bottomRight.x + originX + 8);
    const height = Math.ceil((MAP_WIDTH + MAP_HEIGHT) * (TILE_HEIGHT / 2) + originY + 8);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.translate(originX, originY);
    this.floorOrigin = { x: originX, y: originY };

    for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
      for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
        const noise = hash2(x, y);
        // Stone by the counter and the entrance, boards everywhere else.
        const isStone = x <= 3 || (x <= 4 && y >= 14);
        const base = isStone
          ? shade(PALETTE.floorStone, (noise - 0.5) * 0.08)
          : PALETTE.floorWood[Math.floor(noise * PALETTE.floorWood.length)];
        tilePath(ctx, x, y);
        ctx.fillStyle = base;
        ctx.fill();
        // Board seams only along one axis, so the floor reads as planks.
        ctx.strokeStyle = isStone ? 'rgba(140, 126, 110, 0.35)' : 'rgba(110, 78, 50, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Warm daylight spilling in from the window wall at the top right.
    const light = ctx.createLinearGradient(
      worldToScreen(MAP_WIDTH, 0).x,
      0,
      worldToScreen(0, MAP_HEIGHT).x,
      (MAP_WIDTH + MAP_HEIGHT) * (TILE_HEIGHT / 2),
    );
    light.addColorStop(0, 'rgba(255, 216, 150, 0.26)');
    light.addColorStop(0.45, 'rgba(255, 216, 150, 0.05)');
    light.addColorStop(1, 'rgba(60, 44, 32, 0.16)');
    ctx.fillStyle = light;
    tilePath(ctx, 1, 1, MAP_WIDTH - 2, MAP_HEIGHT - 2);
    ctx.fill();

    // Ground decals (rug, door mat) belong to the floor, not the sort order.
    for (const object of MAP_OBJECTS) {
      if (object.kind !== 'rug' && object.kind !== 'door_mat') continue;
      drawObjectSlice(ctx, object, { x: object.x, y: object.y, w: object.w, h: object.h }, 0, true);
    }

    return canvas;
  }

  private drawWalls(ctx: CanvasRenderingContext2D, time: number, reducedMotion: boolean): void {
    // The two walls that face the camera: y = 0 (upper right) and x = 0 (upper left).
    const wall = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      fill: string,
    ) => {
      const a = worldToScreen(from.x, from.y);
      const b = worldToScreen(to.x, to.y);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - WALL_HEIGHT);
      ctx.lineTo(a.x, a.y - WALL_HEIGHT);
      ctx.closePath();
      ctx.fill();
    };

    wall({ x: 0, y: 1 }, { x: MAP_WIDTH - 1, y: 1 }, PALETTE.wallInner);
    wall({ x: 1, y: 0 }, { x: 1, y: MAP_HEIGHT - 1 }, PALETTE.wallInnerShade);

    // Skirting board.
    const skirting = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const a = worldToScreen(from.x, from.y);
      const b = worldToScreen(to.x, to.y);
      ctx.fillStyle = PALETTE.wallTrim;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - 10);
      ctx.lineTo(a.x, a.y - 10);
      ctx.closePath();
      ctx.fill();
    };
    skirting({ x: 0, y: 1 }, { x: MAP_WIDTH - 1, y: 1 });
    skirting({ x: 1, y: 0 }, { x: 1, y: MAP_HEIGHT - 1 });

    for (const decor of WALL_DECOR) {
      if (decor.wall === 'north') this.drawNorthDecor(ctx, decor.kind, decor.from, decor.to, time, reducedMotion);
      else this.drawWestDecor(ctx, decor.kind, decor.from, decor.to);
    }
  }

  private drawNorthDecor(
    ctx: CanvasRenderingContext2D,
    kind: string,
    from: number,
    to: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    if (kind === 'sign') {
      const a = worldToScreen(from, 1);
      const b = worldToScreen(to, 1);
      ctx.fillStyle = PALETTE.espresso;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 74);
      ctx.lineTo(b.x, b.y - 74);
      ctx.lineTo(b.x, b.y - 112);
      ctx.lineTo(a.x, a.y - 112);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.fillStyle = PALETTE.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 93);
      ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      // Shrink the type until the name fits the board with a margin, so a
      // longer or wider name never spills past the sign's edges.
      const maxWidth = Math.hypot(b.x - a.x, b.y - a.y) - 18;
      let size = 15;
      do {
        ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
        size -= 1;
      } while (size > 8 && ctx.measureText(SIGN_TEXT).width > maxWidth);
      ctx.fillText(SIGN_TEXT, 0, 0);
      ctx.restore();
      return;
    }
    if (kind !== 'window') return;

    const top = 112;
    const bottom = 34;
    for (let x = from; x < to; x += 1) {
      const a = worldToScreen(x + 0.08, 1);
      const b = worldToScreen(x + 0.92, 1);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - bottom);
      ctx.lineTo(b.x, b.y - bottom);
      ctx.lineTo(b.x, b.y - top);
      ctx.lineTo(a.x, a.y - top);
      ctx.closePath();
      ctx.clip();

      // The street outside follows the real sky: day, twilight, night; greyer
      // under cloud. Near-ground darker, sky lighter.
      const night = 1 - this.sky.daylight;
      const grey = this.sky.cloud * 0.5;
      const sky = ctx.createLinearGradient(0, a.y - top, 0, a.y - bottom);
      sky.addColorStop(0, mix(mix(PALETTE.outsideFar, '#aab4b6', grey), '#1c2238', night));
      sky.addColorStop(1, mix(mix(PALETTE.outside, '#8d9799', grey), '#2a2f3e', night));
      ctx.fillStyle = sky;
      ctx.fillRect(a.x - 4, a.y - top - 4, b.x - a.x + 8, top + 8);

      // Suggestion of trees and buildings across the street.
      ctx.fillStyle = night > 0.5 ? 'rgba(28, 32, 40, 0.75)' : 'rgba(96, 112, 104, 0.55)';
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, a.y - bottom - 18, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Lit windows across the street once it gets dark.
      if (night > 0.35) {
        ctx.fillStyle = `rgba(255, 206, 128, ${0.55 * night})`;
        const seed = hash2(x * 5, 3);
        ctx.fillRect(a.x + (b.x - a.x) * (0.2 + seed * 0.4), a.y - bottom - 30 + seed * 6, 3, 4);
      }

      const streaks = Math.round(8 * this.sky.rain);
      if (!reducedMotion && streaks > 0) {
        // Rain streaks running down the glass (SPEC 15.5).
        ctx.strokeStyle = 'rgba(232, 240, 242, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < streaks; i += 1) {
          const seed = hash2(x * 13 + i, i * 7);
          const speed = 90 + seed * 70;
          const offset = ((time / 1000) * speed + seed * 200) % (top - bottom);
          const sx = a.x + (b.x - a.x) * ((seed * 1.7) % 1);
          const sy = a.y - top + offset;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 1.5, sy + 9);
          ctx.stroke();
        }
      }

      // Lightning: a brief flash every so often during a storm.
      if (this.sky.storm && !reducedMotion && time % 11000 < 140) {
        ctx.fillStyle = 'rgba(235, 240, 255, 0.7)';
        ctx.fillRect(a.x - 4, a.y - top - 4, b.x - a.x + 8, top + 8);
      }

      // Glass sheen.
      ctx.fillStyle = `rgba(185, 205, 212, ${0.3 * (1 - night * 0.6)})`;
      ctx.fillRect(a.x - 4, a.y - top - 4, b.x - a.x + 8, top + 8);
      ctx.restore();

      // Frame and mullion.
      ctx.strokeStyle = PALETTE.wallTrim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - bottom);
      ctx.lineTo(b.x, b.y - bottom);
      ctx.lineTo(b.x, b.y - top);
      ctx.lineTo(a.x, a.y - top);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - (top + bottom) / 2);
      ctx.lineTo(b.x, b.y - (top + bottom) / 2);
      ctx.stroke();
    }
  }

  private drawWestDecor(
    ctx: CanvasRenderingContext2D,
    kind: string,
    from: number,
    to: number,
  ): void {
    const a = worldToScreen(1, from);
    const b = worldToScreen(1, to);
    const panel = (topLift: number, bottomLift: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - bottomLift);
      ctx.lineTo(b.x, b.y - bottomLift);
      ctx.lineTo(b.x, b.y - topLift);
      ctx.lineTo(a.x, a.y - topLift);
      ctx.closePath();
      ctx.fill();
    };

    if (kind === 'menu_board') {
      panel(112, 66, PALETTE.espresso);
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 90);
      // The west wall recedes to the lower left, so follow it the other way
      // round or the lettering comes out upside down.
      ctx.rotate(Math.atan2(a.y - b.y, a.x - b.x));
      ctx.fillStyle = PALETTE.linen;
      ctx.font = '500 9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ESPRESSO · FILTER · CORTADO', 0, -6);
      ctx.fillText('PASTRY OF THE DAY', 0, 7);
      ctx.restore();
      return;
    }
    if (kind === 'clock') {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 92 };
      ctx.fillStyle = PALETTE.linen;
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 13, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.walnutSide;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(mid.x + 5, mid.y - 4);
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(mid.x - 2, mid.y + 7);
      ctx.stroke();
      return;
    }
    if (kind === 'art') {
      const count = Math.max(1, Math.floor(to - from));
      for (let i = 0; i < count; i += 1) {
        const p0 = worldToScreen(1, from + i + 0.25);
        const p1 = worldToScreen(1, from + i + 0.75);
        const lift = 96 - (i % 2) * 14;
        ctx.fillStyle = PALETTE.walnutSide;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - lift + 22);
        ctx.lineTo(p1.x, p1.y - lift + 22);
        ctx.lineTo(p1.x, p1.y - lift - 14);
        ctx.lineTo(p0.x, p0.y - lift - 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = ['#c0a07c', '#9aa57c', '#b5706b'][i % 3];
        ctx.beginPath();
        ctx.moveTo(p0.x + 2, p0.y - lift + 18);
        ctx.lineTo(p1.x - 2, p1.y - lift + 18);
        ctx.lineTo(p1.x - 2, p1.y - lift - 10);
        ctx.lineTo(p0.x + 2, p0.y - lift - 10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, scene: SceneInput): void {
    if (!this.floor) this.floor = this.buildFloor();
    this.sky = skyOf(scene.ambience);

    ctx.save();
    const zoom = this.dpr * this.scale;
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    ctx.fillStyle = PALETTE.espresso;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    const offset = this.cameraOffset(scene.cameraX, scene.cameraY);
    ctx.translate(offset.x, offset.y);

    ctx.drawImage(this.floor, -this.floorOrigin.x, -this.floorOrigin.y);
    this.drawWalls(ctx, scene.time, scene.reducedMotion);

    const drawables: Drawable[] = [];

    for (const object of MAP_OBJECTS) {
      if (object.kind === 'rug' || object.kind === 'door_mat') continue;
      for (const slice of sliceObject(object)) {
        const depth =
          object.kind === 'hanging_lamp' ? 1e6 + slice.x + slice.y : objectDepth(slice, object.layer ?? 0);
        drawables.push({
          depth,
          draw: (target) => drawObjectSlice(target, object, slice, scene.time, scene.reducedMotion),
        });
      }
    }

    for (const seat of SEAT_DEFINITIONS) {
      const occupied = scene.occupancy.get(seat.seatId) ?? false;
      drawables.push({
        depth: seat.x + seat.y + 1.2,
        draw: (target) => this.drawSeatWithHighlight(target, seat, occupied, scene),
      });
    }

    for (const avatar of scene.avatars) {
      drawables.push({
        depth: avatar.x + avatar.y + ENTITY_DEPTH_BIAS,
        draw: (target) => {
          drawAvatar(target, avatar);
          drawNamePlate(target, avatar, this.scale);
        },
      });
    }

    drawables.sort((a, b) => a.depth - b.depth);
    for (const drawable of drawables) drawable.draw(ctx);

    ctx.restore();
    this.drawEvening(ctx);
  }

  /**
   * After dark the room dims and the lamps take over: a cool wash over
   * everything, with warm pools of light kept open around the lamps. Drawn in
   * device pixels on top of the scene, so it costs one pass per frame.
   */
  private drawEvening(ctx: CanvasRenderingContext2D): void {
    const night = 1 - this.sky.daylight;
    const dim = night * 0.42 + this.sky.cloud * 0.06 * this.sky.daylight;
    if (dim < 0.01) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = this.width * this.dpr;
    const h = this.height * this.dpr;
    ctx.fillStyle = `rgba(18, 20, 38, ${dim})`;
    ctx.fillRect(0, 0, w, h);
    if (night > 0.05) {
      // Warm lamplight bloom from the centre of the room.
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.6);
      glow.addColorStop(0, `rgba(255, 180, 100, ${0.12 * night})`);
      glow.addColorStop(1, 'rgba(255, 180, 100, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private drawSeatWithHighlight(
    ctx: CanvasRenderingContext2D,
    seat: SeatDefinition,
    occupied: boolean,
    scene: SceneInput,
  ): void {
    if (scene.highlightSeatId === seat.seatId) {
      const pulse = scene.reducedMotion ? 0.5 : (Math.sin(scene.time / 260) + 1) / 2;
      drawSeatHighlight(ctx, seat, pulse);
    }
    drawSeat(ctx, seat, occupied);
  }

  /**
   * Follow the player, but never pan past the room. Without the clamp a player
   * standing by the entrance pushes most of the café off-screen and stares at
   * empty background.
   */
  private cameraOffset(cameraX: number, cameraY: number): { x: number; y: number } {
    const focus = worldToScreen(cameraX, cameraY);
    let offsetX = this.viewWidth / 2 - focus.x;
    let offsetY = this.viewHeight / 2 - focus.y;

    const { left, right, top, bottom, width: sceneWidth, height: sceneHeight } = sceneExtent();
    const margin = SCENE_MARGIN;

    // Centre the room on any axis where it is smaller than the viewport.
    if (sceneWidth <= this.viewWidth) offsetX = this.viewWidth / 2 - (left + right) / 2;
    else offsetX = Math.min(-left + margin, Math.max(this.viewWidth - right - margin, offsetX));

    if (sceneHeight <= this.viewHeight) offsetY = this.viewHeight / 2 - (top + bottom) / 2;
    else offsetY = Math.min(-top + margin, Math.max(this.viewHeight - bottom - margin, offsetY));

    return { x: Math.round(offsetX), y: Math.round(offsetY) };
  }

  /** CSS pixel position of a world point, for DOM overlays. */
  screenPosition(worldX: number, worldY: number, cameraX: number, cameraY: number): { x: number; y: number } {
    const offset = this.cameraOffset(cameraX, cameraY);
    const point = worldToScreen(worldX, worldY);
    return { x: (point.x + offset.x) * this.scale, y: (point.y + offset.y) * this.scale };
  }

  /** Inverse of the projection, for clicks and taps on the canvas. */
  worldAtScreen(
    screenX: number,
    screenY: number,
    cameraX: number,
    cameraY: number,
  ): { x: number; y: number } {
    const offset = this.cameraOffset(cameraX, cameraY);
    return screenToWorld(screenX / this.scale - offset.x, screenY / this.scale - offset.y);
  }
}
