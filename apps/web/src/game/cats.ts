import { MAP_HEIGHT, MAP_WIDTH, isWalkable, worldToScreen } from '@virtual-cafe/shared';

/**
 * The café cats — decorative and local to each browser: not players, never
 * sent to the server, they block nobody and take no seats.
 *
 *  - Three cats (ginger, white, grey) that wander the room: ambles or dashes to a random spot, sometimes
 *    hops when it gets there, then sits a while.
 *
 * Now and then a cat curls up for a nap where it stopped. Walk up and press
 * F (or tap the prompt on a phone): a sleeping cat is stroked (it purrs and
 * dozes on); an awake one is hugged (it stops, says "Meo meo!" and meows).
 */

export type CatReaction = 'pet' | 'hug';

const CAT_RADIUS = 0.2;
const WALK = 0.6; // tiles per second
const RUN = 1.7;
const HOP_SECONDS = 0.55;
const FX_MS = 2600;

interface CatLook {
  fur: string;
  dark: string;
  belly: string;
}

const GINGER: CatLook = { fur: '#e08a3c', dark: '#b8662a', belly: '#f6d3a8' };
const WHITE: CatLook = { fur: '#f2ece2', dark: '#c8bfb2', belly: '#ffffff' };
const GREY: CatLook = { fur: '#8f8a84', dark: '#6b6661', belly: '#c9c4bd' };

type WalkerState = 'rest' | 'move' | 'hop' | 'hug' | 'sleep' | 'pet';

interface Walker {
  /** Never wanders: a cat that only ever sleeps where it was put. */
  fixed?: boolean;
  /** World pixels above the floor (e.g. lying on a table top). */
  lift?: number;
  /** Explicit draw depth, for a cat lying on furniture. */
  depth?: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  state: WalkerState;
  timer: number;
  flip: boolean;
  phase: number;
  look: CatLook;
  fxStart: number;
}

export interface CatTarget {
  kind: CatReaction;
  x: number;
  y: number;
  lift: number;
  react: (now: number) => CatReaction;
}

/**
 * The floor the cat may use: inside the walls with a margin, so it never
 * walks into a wall, off the front edge of the room, or outside the map.
 */
const MIN_X = 1.6;
const MIN_Y = 1.6;
const MAX_X = MAP_WIDTH - 1.6;
const MAX_Y = MAP_HEIGHT - 1.6;

function inRoom(x: number, y: number): boolean {
  return x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y && isWalkable(x, y, CAT_RADIUS);
}

function clearPath(ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.2);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (!inRoom(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function randomFloor(): { x: number; y: number } {
  for (let i = 0; i < 60; i += 1) {
    const x = MIN_X + Math.random() * (MAX_X - MIN_X);
    const y = MIN_Y + Math.random() * (MAX_Y - MIN_Y);
    if (inRoom(x, y)) return { x, y };
  }
  return SAFE_SPOT;
}

/** Open floor in the middle of the room, used if a spot cannot be found. */
const SAFE_SPOT = { x: 6.5, y: 10.5 };

export class CatColony {
  /** Three café cats, all free to wander: ginger, white and grey. */
  readonly walkers: Walker[] = [GINGER, WHITE, GREY].map((look) => {
    const at = randomFloor();
    return {
      ...at,
      tx: at.x,
      ty: at.y,
      speed: WALK,
      state: 'rest' as WalkerState,
      timer: 1 + Math.random() * 4,
      flip: Math.random() < 0.5,
      phase: Math.random() * 10,
      look,
      fxStart: -1e9,
    };
  });

  /** Plus one cat that only sleeps, curled up on the middle of the community table. */
  constructor() {
    this.walkers.push({
      x: 11.5,
      y: 7.7,
      tx: 11.5,
      ty: 7.7,
      speed: 0,
      state: 'sleep',
      timer: 1e9,
      flip: true,
      phase: 3,
      look: { fur: '#5b4636', dark: '#3d2e23', belly: '#8a7260' }, // brown tabby
      fxStart: -1e9,
      fixed: true,
      // Community table top (furniture.ts draws it at 44).
      lift: 44,
      // Just after the table slice it lies on (x 11: 11 + 1 + 7 + 2).
      depth: 21.05,
    });
  }

  update(dt: number, reducedMotion: boolean): void {
    for (const cat of this.walkers) {
      if (cat.fixed) {
        cat.phase += dt;
        // Stroked: purr for a moment, then simply keep sleeping.
        if (cat.state === 'pet') {
          cat.timer -= dt;
          if (cat.timer <= 0) {
            cat.state = 'sleep';
            cat.timer = 1e9;
          }
        }
        continue;
      }
      this.step(cat, dt, reducedMotion);
    }
  }

  private step(c: Walker, dt: number, reducedMotion: boolean): void {
    c.phase += dt;
    // Whatever happened (a long pause, a map change), never stay outside.
    if (!inRoom(c.x, c.y)) {
      c.x = SAFE_SPOT.x;
      c.y = SAFE_SPOT.y;
      c.state = 'rest';
      c.timer = 1;
    }
    if (c.state === 'hug') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'rest';
        c.timer = 2 + Math.random() * 3;
      }
      return;
    }
    // Asleep (or being stroked): curled up where it is, then wakes on its own.
    if (c.state === 'sleep' || c.state === 'pet') {
      c.timer -= dt;
      if (c.timer <= 0) {
        if (c.state === 'pet') {
          // Stroking over: it settles back to sleep for a while.
          c.state = 'sleep';
          c.timer = 8 + Math.random() * 10;
        } else {
          c.state = 'rest';
          c.timer = 1 + Math.random() * 2;
        }
      }
      return;
    }
    if (reducedMotion) {
      c.state = 'rest';
      return;
    }
    if (c.state === 'hop') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'rest';
        c.timer = 3 + Math.random() * 6;
      }
      return;
    }
    if (c.state === 'rest') {
      c.timer -= dt;
      if (c.timer > 0) return;
      for (let i = 0; i < 8; i += 1) {
        const goal = randomFloor();
        const far = Math.hypot(goal.x - c.x, goal.y - c.y);
        if (far > 1.5 && far < 10 && clearPath(c.x, c.y, goal.x, goal.y)) {
          c.tx = goal.x;
          c.ty = goal.y;
          c.speed = Math.random() < 0.35 ? RUN : WALK;
          c.state = 'move';
          return;
        }
      }
      c.timer = 1 + Math.random() * 2;
      return;
    }
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const left = Math.hypot(dx, dy);
    const step = c.speed * dt;
    // Screen x grows with world x − y: face the way it is going.
    c.flip = dx - dy < 0;
    if (left <= step) {
      c.x = c.tx;
      c.y = c.ty;
      const roll = Math.random();
      if (roll < 0.3) {
        // Nap: 20–45 s curled up on the spot.
        c.state = 'sleep';
        c.timer = 20 + Math.random() * 25;
      } else if (roll < 0.6) {
        c.state = 'hop';
        c.timer = HOP_SECONDS;
      } else {
        c.state = 'rest';
        c.timer = 3 + Math.random() * 7;
      }
      return;
    }
    const nx = c.x + (dx / left) * step;
    const ny = c.y + (dy / left) * step;
    // Every step must stay on the room's floor; if not, stop and rethink.
    if (!inRoom(nx, ny)) {
      c.state = 'rest';
      c.timer = 0.5 + Math.random();
      return;
    }
    c.x = nx;
    c.y = ny;
  }

  /** A sleeping cat is stroked (purrs, stays asleep); an awake one is hugged. */
  targets(): CatTarget[] {
    return this.walkers.map((cat) => {
      const asleep = cat.state === 'sleep' || cat.state === 'pet';
      return {
        kind: asleep ? ('pet' as const) : ('hug' as const),
        x: cat.x,
        y: cat.y,
        lift: 0,
        react: (now: number): CatReaction => {
          cat.fxStart = now;
          cat.timer = FX_MS / 1000;
          cat.state = asleep ? 'pet' : 'hug';
          return asleep ? 'pet' : 'hug';
        },
      };
    });
  }

  drawables(now: number, reducedMotion: boolean): Array<{ depth: number; draw: (ctx: CanvasRenderingContext2D) => void }> {
    return this.walkers.map((cat) => ({
      depth: cat.depth ?? cat.x + cat.y + 1.2,
      draw: (ctx: CanvasRenderingContext2D) =>
        cat.state === 'sleep' || cat.state === 'pet'
          ? drawSleeping(ctx, cat, now, reducedMotion)
          : drawWalker(ctx, cat, now),
    }));
  }
}

// ---------------------------------------------------------------- sounds

let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** A synthesised meow-meow (hug) or a soft purr (stroke). */
export function playCatSound(kind: CatReaction, volume: number): void {
  if (volume <= 0) return;
  const a = audioContext();
  if (!a) return;
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.value = volume;
  out.connect(a.destination);

  if (kind === 'hug') {
    for (const [start, length] of [
      [0, 0.38],
      [0.5, 0.42],
    ]) {
      const osc = a.createOscillator();
      osc.type = 'sawtooth';
      const filter = a.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 3;
      const gain = a.createGain();
      osc.connect(filter).connect(gain).connect(out);
      osc.frequency.setValueAtTime(520, t + start);
      osc.frequency.linearRampToValueAtTime(840, t + start + length * 0.35);
      osc.frequency.linearRampToValueAtTime(430, t + start + length);
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.linearRampToValueAtTime(0.35, t + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + length);
      osc.start(t + start);
      osc.stop(t + start + length + 0.05);
    }
    return;
  }

  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 26;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.28, t + 0.3);
  gain.gain.linearRampToValueAtTime(0, t + 2.2);
  const lfo = a.createOscillator();
  lfo.frequency.value = 2.2;
  const depth = a.createGain();
  depth.gain.value = 0.12;
  lfo.connect(depth).connect(gain.gain);
  osc.connect(filter).connect(gain).connect(out);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 2.3);
  lfo.stop(t + 2.3);
}

// --------------------------------------------------------------- drawing

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.fillStyle = 'rgba(58, 40, 28, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
}

function ears(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + side * r * 0.85, hy - r * 0.25);
    ctx.lineTo(hx + side * r * 0.55, hy - r * 1.35);
    ctx.lineTo(hx + side * r * 0.1, hy - r * 0.75);
    ctx.closePath();
    ctx.fill();
  }
}

/** Happy closed eyes: ^ ^ */
function happyEyes(ctx: CanvasRenderingContext2D, hx: number, hy: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + side * 2 - 1.3, hy + 0.3);
    ctx.lineTo(hx + side * 2, hy - 1);
    ctx.lineTo(hx + side * 2 + 1.3, hy + 0.3);
    ctx.stroke();
  }
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.bezierCurveTo(x - size * 1.4, y - size * 0.1, x - size * 0.6, y - size * 1.1, x, y - size * 0.35);
  ctx.bezierCurveTo(x + size * 0.6, y - size * 1.1, x + size * 1.4, y - size * 0.1, x, y + size * 0.9);
  ctx.fill();
}

/** Three hearts drifting up from (x, y) for FX_MS after `start`. */
function hearts(ctx: CanvasRenderingContext2D, x: number, y: number, start: number, now: number): void {
  const t = (now - start) / FX_MS;
  if (t < 0 || t > 1) return;
  for (let i = 0; i < 3; i += 1) {
    const local = t * 1.4 - i * 0.18;
    if (local < 0 || local > 1) continue;
    ctx.globalAlpha = 1 - local;
    ctx.fillStyle = i === 1 ? '#f28aa0' : '#e86a86';
    heart(ctx, x + Math.sin(local * 6 + i * 2) * 5 + (i - 1) * 5, y - local * 30, 3.2 + i * 0.4);
  }
  ctx.globalAlpha = 1;
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, start: number, now: number): void {
  const t = (now - start) / FX_MS;
  if (t < 0 || t > 1) return;
  ctx.globalAlpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
  ctx.font = '600 8px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(245, 236, 224, 0.95)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 14, w, 13, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 1.5);
  ctx.lineTo(x + 3, y - 1.5);
  ctx.lineTo(x, y + 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5a3a26';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 7.5);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

/** Curled up asleep: a slow breath and a "z"; stroked = happy eyes, hearts, purr text. */
function drawSleeping(ctx: CanvasRenderingContext2D, cat: Walker, now: number, reducedMotion: boolean): void {
  const p = worldToScreen(cat.x, cat.y);
  const x = p.x;
  const y = p.y - (cat.lift ?? 0);
  const s = cat.flip ? -1 : 1;
  const petted = cat.state === 'pet';
  const breathe = reducedMotion ? 0 : Math.sin(now / (petted ? 400 : 900) + cat.phase) * 0.6;
  shadow(ctx, x, y + 2, 11);
  ctx.fillStyle = cat.look.fur;
  ctx.beginPath();
  ctx.ellipse(x, y - 5 - breathe * 0.5, 11, 6.5 + breathe * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const flick = petted && !reducedMotion ? Math.sin(now / 120) * 0.15 : 0;
  ctx.strokeStyle = cat.look.dark;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - 3, 9, Math.PI * (0.15 + flick), Math.PI * (0.85 + flick));
  ctx.stroke();
  const hx = x + s * 8;
  const hy = y - (petted ? 9 : 7);
  ears(ctx, hx, hy, 5, cat.look.fur);
  ctx.fillStyle = cat.look.fur;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fill();
  if (petted) {
    happyEyes(ctx, hx, hy, cat.look.dark);
    hearts(ctx, hx, hy - 8, cat.fxStart, now);
    bubble(ctx, x, y - 22, 'Rừ rừ… ♥', cat.fxStart, now);
    return;
  }
  ctx.strokeStyle = cat.look.dark;
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + side * 2, hy, 1.2, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
  if (!reducedMotion) {
    const rise = (now / 2200 + cat.phase * 0.37) % 1;
    ctx.globalAlpha = 0.7 * (1 - rise);
    ctx.fillStyle = '#f5ece0';
    ctx.font = `600 ${7 + rise * 4}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('z', hx + s * 4 + rise * 4 * s, hy - 8 - rise * 14);
    ctx.globalAlpha = 1;
  }
}

function drawWalker(ctx: CanvasRenderingContext2D, cat: Walker, now: number): void {
  const p = worldToScreen(cat.x, cat.y);
  const s = cat.flip ? -1 : 1;
  const moving = cat.state === 'move';
  const running = moving && cat.speed > WALK;
  const step = moving ? Math.sin(cat.phase * (running ? 22 : 12)) : 0;
  const hop = cat.state === 'hop' ? Math.sin(Math.PI * (1 - cat.timer / HOP_SECONDS)) * 14 : 0;
  // A hug: the cat bounces happily on the spot.
  const hugBounce = cat.state === 'hug' ? Math.abs(Math.sin((now - cat.fxStart) / 140)) * 3 : 0;
  const lift = (moving ? Math.abs(step) * (running ? 1.6 : 0.8) : 0) + hop + hugBounce;
  const x = p.x;
  const y = p.y;
  shadow(ctx, x, y + 1, hop > 0 ? 10 - hop * 0.3 : 10);

  const by = y - lift;
  ctx.strokeStyle = cat.look.dark;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const legs = moving || hop > 0 ? [-6, -2, 3, 7] : [-5, 5];
  legs.forEach((lx, i) => {
    const swing = moving ? step * (i % 2 ? 1 : -1) * (running ? 2.6 : 1.6) : 0;
    const tuck = hop > 0 ? 2.5 : 0;
    ctx.beginPath();
    ctx.moveTo(x + s * lx, by - 6);
    ctx.lineTo(x + s * (lx + swing), by - tuck);
    ctx.stroke();
  });

  ctx.strokeStyle = cat.look.fur;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  if (moving || hop > 0) {
    ctx.moveTo(x - s * 9, by - 9);
    ctx.quadraticCurveTo(x - s * 15, by - 14, x - s * 12, by - 21 + Math.sin(cat.phase * 3) * 1.5);
  } else {
    const wag = cat.state === 'hug' ? Math.sin((now - cat.fxStart) / 110) * 3 : 0;
    ctx.moveTo(x - s * 7, by - 3);
    ctx.quadraticCurveTo(x - s * 2, by + 2, x + s * 5, by - 1 + wag);
  }
  ctx.stroke();

  ctx.fillStyle = cat.look.fur;
  ctx.beginPath();
  if (moving || hop > 0) ctx.ellipse(x, by - 9, running ? 11 : 10, running ? 4.5 : 5, 0, 0, Math.PI * 2);
  else ctx.ellipse(x - s, by - 8, 7, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cat.look.belly;
  ctx.beginPath();
  if (moving || hop > 0) ctx.ellipse(x + s * 2, by - 7, 5, 2.4, 0, 0, Math.PI * 2);
  else ctx.ellipse(x + s, by - 6, 3.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const hx = moving || hop > 0 ? x + s * 10 : x + s * 2;
  const hy = moving || hop > 0 ? by - 14 : by - 17;
  ears(ctx, hx, hy, 5, cat.look.fur);
  ctx.fillStyle = cat.look.fur;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fill();

  if (cat.state === 'hug') {
    happyEyes(ctx, hx, hy, '#2a2420');
    // Blush.
    ctx.fillStyle = 'rgba(232, 120, 140, 0.55)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx + side * 3.2, hy + 1.8, 1.3, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    hearts(ctx, hx, hy - 8, cat.fxStart, now);
    bubble(ctx, hx, hy - 12, 'Meo meo!', cat.fxStart, now);
  } else {
    const blink = Math.sin(cat.phase * 0.9) > 0.97;
    ctx.fillStyle = '#2a2420';
    for (const side of [-1, 1]) {
      if (blink) ctx.fillRect(hx + side * 2 - 1, hy - 0.4, 2, 0.8);
      else {
        ctx.beginPath();
        ctx.arc(hx + side * 2 + s * 0.6, hy - 0.4, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#d98a8a';
  ctx.beginPath();
  ctx.arc(hx + s * 0.8, hy + 1.6, 0.8, 0, Math.PI * 2);
  ctx.fill();
}
