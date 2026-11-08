import {
  MAP_HEIGHT,
  MAP_OBJECTS,
  MapObject,
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
import { CatColony } from './cats';
import type { CatReaction } from './cats';

/** How close (tiles) you must stand to a cat to stroke or hug it. */
const CAT_REACH = 1.6;
import { SCENE_MARGIN, sceneExtent, worldScaleFor } from './viewport';
import type { WorldAmbience } from '@/world/ambience';
import { SkyFader, paintSkyLayers, skyNameFor } from '@/world/skybox';
import type { SkyName } from '@/world/skybox';

/** The window wall is split into this many large panes. */
const WINDOW_PANES = 4;

/** What the chalkboard over the counter offers. */
const MENU_ITEMS: Array<[string, string]> = [
  ['Cà phê', '45K'],
  ['Trà', '40K'],
  ['Matcha', '55K'],
  ['Bánh ngọt', '35K'],
];

/** Name painted on the sign over the order counter. */
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

/** Lamps that light the room after dark, with the height of their bulb. */
const LAMPS: Array<{ object: MapObject; bulb: number; radius: number }> = MAP_OBJECTS.filter(
  (object) => object.kind === 'hanging_lamp' || object.kind === 'floor_lamp',
).map((object) =>
  object.kind === 'hanging_lamp'
    ? { object, bulb: 140, radius: 120 }
    : { object, bulb: 98, radius: 110 },
);

function skyOf(ambience: WorldAmbience | null | undefined): Sky {
  if (!ambience) return DEFAULT_SKY;
  // Without live weather the clock still sets day and night.
  if (!ambience.live) return { ...DEFAULT_SKY, daylight: ambience.daylight };
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
  private skyName: SkyName = 'day';
  private skyFader = new SkyFader();
  /** 0..1, eased towards the lamps' on/off state so switching never pops. */
  private lampLevel = 0;
  private cats = new CatColony();
  /** Scene time of the last frame, so a click's effect starts now. */
  private lastTime = 0;
  private lastFrame = 0;

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
        const isStone = x <= 2;
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
    if (kind === 'neon') {
      // "KHU CHƠI GAME" in purple neon on a dark panel above the stations.
      const a = worldToScreen(from + 0.3, 1);
      const b = worldToScreen(to - 0.3, 1);
      ctx.fillStyle = '#1d1726';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 40);
      ctx.lineTo(b.x, b.y - 40);
      ctx.lineTo(b.x, b.y - 118);
      ctx.lineTo(a.x, a.y - 118);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 80);
      ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
      ctx.shadowColor = '#a866ff';
      ctx.shadowBlur = reducedMotion ? 6 : 8 + Math.sin(time / 600) * 3;
      ctx.fillStyle = '#d9c2ff';
      ctx.fillText('KHU CHƠI GAME', 0, 0);
      ctx.restore();
      return;
    }
    if (kind !== 'window') return;
    this.drawWindowWall(ctx, from, to, time, reducedMotion);
  }

  /**
   * One tall, clear glass wall onto the street. The outside is painted as a
   * single continuous scene behind thin mullions, so the weather reads at a
   * glance: sky colour, sun or moon, clouds, rain, fog and the lit windows
   * across the road all follow the real sky (see world/ambience.ts).
   */
  private drawWindowWall(
    ctx: CanvasRenderingContext2D,
    from: number,
    to: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    const top = WALL_HEIGHT - 10;
    const bottom = 14;
    const a = worldToScreen(from + 0.04, 1);
    const b = worldToScreen(to - 0.04, 1);
    const night = 1 - this.sky.daylight;
    const grey = this.sky.cloud * 0.6;
    const rain = this.sky.rain;

    /** Point `lift` px up the wall, a fraction `u` of the way along it. */
    const at = (u: number, lift: number) => ({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u - lift,
    });
    const quad = (u0: number, u1: number, h0: number, h1: number, fill: string) => {
      const p0 = at(u0, h0);
      const p1 = at(u1, h0);
      const p2 = at(u1, h1);
      const p3 = at(u0, h1);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
    };
    const minX = Math.min(a.x, b.x) - 4;
    const width = Math.abs(b.x - a.x) + 8;
    const minY = Math.min(a.y, b.y) - top - 4;
    const height = Math.abs(b.y - a.y) + top + 8;

    ctx.save();
    ctx.beginPath();
    const c0 = at(0, bottom);
    const c1 = at(1, bottom);
    const c2 = at(1, top);
    const c3 = at(0, top);
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.closePath();
    ctx.clip();

    // Sky: blue by day, amber at the edges of the day, deep navy at night,
    // washed towards grey under cloud.
    const twilight = Math.max(0, 1 - Math.abs(this.sky.daylight - 0.5) * 2.4);
    const skyTop = mix(mix(mix('#7fb2d9', '#9aa6b0', grey), '#e59a6a', twilight * 0.6), '#0f1630', night);
    const skyLow = mix(mix(mix('#cfe3ee', '#c2c8cc', grey), '#f3c48e', twilight * 0.7), '#26304a', night);
    const sky = ctx.createLinearGradient(0, minY, 0, minY + height);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(minX, minY, width, height);

    // The panorama for the time of day, with live cloud and rain over it.
    // The gradient above stays as the fallback while it downloads.
    const skyShown = paintSkyLayers(
      ctx,
      this.skyFader.update(this.skyName, performance.now(), reducedMotion),
      minX,
      minY,
      width,
      height,
      { cloud: this.sky.cloud, rain: rain, night },
    );

    // Sun by day, moon at night — hidden behind heavy cloud.
    if (!skyShown && this.sky.cloud < 0.85) {
      const body = at(0.78, top - 26);
      const visible = 1 - Math.max(0, this.sky.cloud - 0.4) / 0.45;
      ctx.globalAlpha = Math.max(0, Math.min(1, visible));
      ctx.fillStyle = night > 0.5 ? '#eef1f7' : '#fff1c4';
      ctx.beginPath();
      ctx.arc(body.x, body.y, night > 0.5 ? 9 : 12, 0, Math.PI * 2);
      ctx.fill();
      if (night > 0.5) {
        ctx.fillStyle = skyTop;
        ctx.beginPath();
        ctx.arc(body.x + 4, body.y - 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Stars on a clear night.
    if (!skyShown && night > 0.6 && this.sky.cloud < 0.5) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * night * (1 - this.sky.cloud * 2)})`;
      for (let i = 0; i < 26; i += 1) {
        const s = at(hash2(i, 1), top - 6 - hash2(i, 2) * 40);
        ctx.fillRect(s.x, s.y, 1.2, 1.2);
      }
    }

    // Clouds drifting slowly along the street.
    const cloudCount = Math.round(2 + this.sky.cloud * 7);
    const cloudColour = mix(mix('#ffffff', '#8e979e', grey + rain * 0.3), '#3a4256', night);
    ctx.fillStyle = cloudColour;
    for (let i = 0; i < cloudCount; i += 1) {
      const drift = reducedMotion ? 0 : (time / 240000) * (0.6 + hash2(i, 9) * 0.6);
      const u = (hash2(i, 4) + drift) % 1.15 - 0.075;
      const c = at(u, top - 14 - hash2(i, 5) * 28);
      ctx.globalAlpha = 0.55 + this.sky.cloud * 0.4;
      for (let j = 0; j < 3; j += 1) {
        ctx.beginPath();
        ctx.ellipse(c.x + (j - 1) * 11, c.y - (j === 1 ? 4 : 0), 13, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Buildings across the street, with lit windows after dark.
    const buildingFar = mix(mix('#9aa7a6', '#8b9294', grey), '#1a2032', night);
    const buildingNear = mix(mix('#7d8a86', '#757d80', grey), '#141a28', night);
    const lit = Math.max(0, (night - 0.25) / 0.75);
    let u = 0;
    let n = 0;
    while (u < 1) {
      const w = 0.035 + hash2(n, 11) * 0.05;
      const h = 34 + hash2(n, 12) * 38;
      quad(u, u + w, bottom + 18, bottom + 18 + h, n % 2 ? buildingFar : buildingNear);
      if (lit > 0) {
        for (let row = 0; row < 4; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            if (hash2(n * 7 + row, col * 3) > 0.55) continue;
            const wu = u + w * (0.25 + col * 0.4);
            const wh = bottom + 26 + row * 10;
            if (wh > bottom + 14 + h) continue;
            quad(wu, wu + w * 0.18, wh, wh + 4, `rgba(255, 205, 130, ${0.85 * lit})`);
          }
        }
      }
      u += w + 0.004;
      n += 1;
    }

    // Trees along the pavement.
    ctx.fillStyle = mix(mix('#6f8a5c', '#66735e', grey), '#141c18', night);
    for (let i = 0; i < 9; i += 1) {
      const tp = at(0.05 + i * 0.112 + hash2(i, 21) * 0.03, bottom + 26);
      ctx.beginPath();
      ctx.ellipse(tp.x, tp.y, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Street and pavement, wet and reflective in the rain.
    quad(0, 1, bottom - 4, bottom + 18, mix(mix('#8d8a84', '#5f646a', rain), '#1b1f28', night));
    if (night > 0.3) {
      // Street lamps' pools of light on the pavement.
      for (let i = 0; i < 4; i += 1) {
        const lp = at(0.12 + i * 0.26, bottom + 6);
        const glow = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 22);
        glow.addColorStop(0, `rgba(255, 200, 120, ${0.45 * night})`);
        glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lp.x - 22, lp.y - 22, 44, 44);
      }
    }

    // Fog and heavy rain soften everything behind the glass.
    const haze = Math.max(this.sky.cloud > 0.9 && rain === 0 ? 0.15 : 0, rain * 0.25);
    if (haze > 0) {
      ctx.fillStyle = `rgba(200, 210, 216, ${haze * (1 - night * 0.6)})`;
      ctx.fillRect(minX, minY, width, height);
    }

    // Falling rain outside, then drops running down the glass.
    if (!reducedMotion && rain > 0) {
      ctx.strokeStyle = `rgba(225, 235, 245, ${0.35 + rain * 0.3})`;
      ctx.lineWidth = 1;
      const drops = Math.round(40 + rain * 120);
      for (let i = 0; i < drops; i += 1) {
        const seed = hash2(i, 31);
        const fall = ((time / 1000) * (260 + seed * 120) + seed * 400) % (top - bottom + 20);
        const d = at(hash2(i, 32), top - fall);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + 8);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(235, 242, 246, 0.55)';
      ctx.lineWidth = 1.4;
      const streaks = Math.round(10 + rain * 30);
      for (let i = 0; i < streaks; i += 1) {
        const seed = hash2(i, 41);
        const run = ((time / 1000) * (25 + seed * 30) + seed * 300) % (top - bottom);
        const d = at(hash2(i, 42), top - run);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 0.6, d.y + 6);
        ctx.stroke();
      }
    }

    // Lightning lights the whole sky for a moment.
    if (this.sky.storm && !reducedMotion && time % 11000 < 140) {
      ctx.fillStyle = 'rgba(235, 240, 255, 0.65)';
      ctx.fillRect(minX, minY, width, height);
    }

    // Clear glass: only a faint diagonal glint, so the street stays visible.
    const glint = ctx.createLinearGradient(minX, minY, minX + width, minY + height);
    glint.addColorStop(0, 'rgba(255, 255, 255, 0)');
    glint.addColorStop(0.45, `rgba(255, 255, 255, ${0.07 * (1 - night * 0.7)})`);
    glint.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glint;
    ctx.fillRect(minX, minY, width, height);
    ctx.restore();

    // Frame, then mullions splitting the glass into a few large panes.
    ctx.strokeStyle = PALETTE.wallTrim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 4;
    for (let pane = 1; pane < WINDOW_PANES; pane += 1) {
      const m = pane / WINDOW_PANES;
      const p0 = at(m, bottom);
      const p1 = at(m, top);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    // Window sill.
    quad(0, 1, bottom - 3, bottom, shade(PALETTE.wallTrim, -0.12));
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

    // The west wall recedes to the lower left, so text follows it the other
    // way round or the lettering comes out upside down.
    const wallText = (lift: number, draw: (width: number) => void) => {
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - lift);
      ctx.rotate(Math.atan2(a.y - b.y, a.x - b.x));
      draw(Math.hypot(b.x - a.x, b.y - a.y));
      ctx.restore();
    };

    if (kind === 'sign') {
      // Góc Quen, warm-lit, on a walnut board above the order counter.
      panel(126, 96, PALETTE.walnutSide);
      panel(124, 98, PALETTE.espresso);
      wallText(111, (width) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let size = 17;
        do {
          ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
          size -= 1;
        } while (size > 8 && ctx.measureText(SIGN_TEXT).width > width - 16);
        ctx.shadowColor = 'rgba(255, 196, 120, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = PALETTE.accent;
        ctx.fillText(SIGN_TEXT, 0, 0);
      });
      return;
    }

    if (kind === 'menu_board') {
      // Chalkboard menu: title, then item and price in two columns.
      panel(124, 54, PALETTE.walnutSide);
      panel(122, 56, '#2a2622');
      wallText(89, (width) => {
        const left = -width / 2 + 12;
        const right = width / 2 - 12;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PALETTE.cream;
        ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MENU', 0, -25);
        ctx.strokeStyle = 'rgba(232, 220, 202, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, -17);
        ctx.lineTo(right, -17);
        ctx.stroke();
        ctx.font = '500 8.5px ui-sans-serif, system-ui, sans-serif';
        MENU_ITEMS.forEach(([item, price], i) => {
          const y = -7 + i * 11;
          ctx.fillStyle = PALETTE.linen;
          ctx.textAlign = 'left';
          ctx.fillText(item, left, y);
          ctx.fillStyle = PALETTE.accent;
          ctx.textAlign = 'right';
          ctx.fillText(price, right, y);
        });
      });
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
    this.skyName = skyNameFor(scene.ambience);
    const target = scene.ambience?.lightsOn ? 1 : 0;
    const dt = this.lastFrame ? Math.min(0.1, (scene.time - this.lastFrame) / 1000) : 1;
    this.lastFrame = scene.time;
    this.lampLevel += (target - this.lampLevel) * (scene.reducedMotion ? 1 : Math.min(1, dt * 1.5));

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

    // Café cats: asleep on the counter and in the lounge, one wandering.
    this.lastTime = scene.time;
    this.cats.update(Math.min(dt, 0.1), scene.reducedMotion);
    drawables.push(...this.cats.drawables(scene.time, scene.reducedMotion));

    drawables.sort((a, b) => a.depth - b.depth);
    for (const drawable of drawables) drawable.draw(ctx);

    ctx.restore();
    this.drawEvening(ctx, offset);
  }

  /**
   * After dark the room dims and the lamps take over: a cool wash over
   * everything, with warm pools of light kept open around the lamps. Drawn in
   * device pixels on top of the scene, so it costs one pass per frame.
   */
  private drawEvening(ctx: CanvasRenderingContext2D, offset: { x: number; y: number }): void {
    const night = 1 - this.sky.daylight;
    const lamps = this.lampLevel;
    // Evening is warm, not dark: a light amber wash keeps the room readable,
    // and the lamps only add small pools of light where people sit.
    const dim = night * 0.2 * (1 - lamps * 0.4);
    if (dim < 0.01 && lamps < 0.01) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = this.width * this.dpr;
    const h = this.height * this.dpr;
    const zoom = this.scale * this.dpr;
    if (dim >= 0.01) {
      // Warm brown, not night blue.
      ctx.fillStyle = `rgba(62, 36, 20, ${dim})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (lamps >= 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      // Overall warm fill so the whole room reads as lamp-lit.
      ctx.fillStyle = `rgba(255, 176, 96, ${0.07 * lamps})`;
      ctx.fillRect(0, 0, w, h);
      for (const lamp of LAMPS) {
        const cx = lamp.object.x + lamp.object.w / 2;
        const cy = lamp.object.y + lamp.object.h / 2;
        const floor = worldToScreen(cx, cy);
        const fx = (floor.x + offset.x) * zoom;
        const fy = (floor.y + offset.y) * zoom;
        // Accent only: a small pool over the seats, not the whole area.
        const r = lamp.radius * 0.6 * zoom;
        // Pool of light on the floor and furniture below the lamp.
        const pool = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        pool.addColorStop(0, `rgba(255, 196, 120, ${0.18 * lamps})`);
        pool.addColorStop(0.5, `rgba(255, 170, 90, ${0.08 * lamps})`);
        pool.addColorStop(1, 'rgba(255, 170, 90, 0)');
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.ellipse(fx, fy, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Halo around the bulb itself.
        const by = fy - lamp.bulb * zoom;
        // Soft, small glow: enough to read as "on" without glaring.
        const haloR = 20 * zoom;
        const halo = ctx.createRadialGradient(fx, by, 0, fx, by, haloR);
        halo.addColorStop(0, `rgba(255, 228, 180, ${0.28 * lamps})`);
        halo.addColorStop(1, 'rgba(255, 210, 140, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(fx - haloR, by - haloR, haloR * 2, haloR * 2);
      }
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

  /** The nearest café cat within reach of world (x, y), if any. */
  private nearestCat(x: number, y: number) {
    let best: { target: ReturnType<CatColony['targets']>[number]; distance: number } | null = null;
    for (const target of this.cats.targets()) {
      const distance = Math.hypot(target.x - x, target.y - y);
      if (distance <= CAT_REACH && (!best || distance < best.distance)) best = { target, distance };
    }
    return best?.target ?? null;
  }

  /** What pressing the cat key would do from (x, y): stroke, hug, or nothing. */
  nearbyCat(x: number, y: number): CatReaction | null {
    return this.nearestCat(x, y)?.kind ?? null;
  }

  /** Stroke or hug the nearest cat within reach of (x, y). */
  interactCat(x: number, y: number): CatReaction | null {
    const target = this.nearestCat(x, y);
    return target ? target.react(this.lastTime) : null;
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
