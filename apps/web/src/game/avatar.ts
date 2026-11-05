import { AVATAR_PRESETS, Direction, PlayerStatus, worldToScreen } from '@virtual-cafe/shared';
import { ICON_VIEWBOX, NPC_ICON_PATHS, STATUS_ICON_PATHS } from '@/icons/statusIcons';
import { PALETTE, shade } from './palette';

/** On-screen size of the status icon inside a name plate, in CSS pixels. */
const ICON_SIZE = 11;

/** Stroke weight the icon should appear to have on screen, in CSS pixels. */
const ICON_STROKE_ON_SCREEN = 1.25;

/**
 * Path2D objects are built on first use and reused forever.
 *
 * They are not created at module scope on purpose: Path2D is a browser API and
 * this module is imported during the server render, where it does not exist.
 */
const statusPathCache = new Map<PlayerStatus, Path2D[]>();
let npcPathCache: Path2D[] | null = null;

function statusIconPaths(status: PlayerStatus): Path2D[] {
  let cached = statusPathCache.get(status);
  if (!cached) {
    cached = STATUS_ICON_PATHS[status].map((d) => new Path2D(d));
    statusPathCache.set(status, cached);
  }
  return cached;
}

function npcIconPaths(): Path2D[] {
  npcPathCache ??= NPC_ICON_PATHS.map((d) => new Path2D(d));
  return npcPathCache;
}

/**
 * Avatars (SPEC 7.1): one consistent base body, eight facings, and the four
 * animations the MVP needs — idle, walk, sit and work. Drawn rather than
 * spritesheeted so the proportions and lighting match the furniture exactly.
 */

export interface AvatarRenderState {
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  seated: boolean;
  /** Seconds of accumulated animation time. */
  phase: number;
  status: PlayerStatus;
  displayName: string;
  presetId: string;
  isNpc: boolean;
  isSelf: boolean;
  micOn: boolean;
  inVoiceGroup: boolean;
  /** Client-side muted by the viewer (SPEC 14.3). */
  mutedByViewer: boolean;
  reducedMotion: boolean;
}

const FACING_X: Record<Direction, number> = {
  north: 0,
  north_east: 1,
  east: 1,
  south_east: 1,
  south: 0,
  south_west: -1,
  west: -1,
  north_west: -1,
};

/** Whether the face is turned towards the camera. */
function facesCamera(direction: Direction): boolean {
  return direction === 'south' || direction === 'south_east' || direction === 'south_west' ||
    direction === 'east' || direction === 'west';
}

function preset(presetId: string) {
  return AVATAR_PRESETS.find((item) => item.id === presetId) ?? AVATAR_PRESETS[0];
}

export function drawAvatar(ctx: CanvasRenderingContext2D, state: AvatarRenderState): void {
  const colours = preset(state.presetId);
  const origin = worldToScreen(state.x, state.y);
  const bobbing = state.moving && !state.reducedMotion ? Math.sin(state.phase * 11) * 1.6 : 0;
  const breathing = state.reducedMotion ? 0 : Math.sin(state.phase * 2.1) * 0.6;
  const seatDrop = state.seated ? 9 : 0;
  const baseY = origin.y - seatDrop;
  const facing = FACING_X[state.direction];

  // Contact shadow.
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.ellipse(origin.x, origin.y + 2, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyHeight = state.seated ? 22 : 30;
  const bodyTop = baseY - bodyHeight - 10 + bobbing + breathing;

  // Legs.
  ctx.strokeStyle = shade(colours.top, -0.45);
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.5;
  if (state.seated) {
    // Knees forward, shins down: a seated silhouette reads instantly.
    ctx.beginPath();
    ctx.moveTo(origin.x - 3, baseY - 10);
    ctx.lineTo(origin.x + facing * 7 - 1, baseY - 7);
    ctx.lineTo(origin.x + facing * 7 - 1, baseY + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x + 3, baseY - 10);
    ctx.lineTo(origin.x + facing * 7 + 3, baseY - 6);
    ctx.lineTo(origin.x + facing * 7 + 3, baseY + 2);
    ctx.stroke();
  } else {
    const swing = state.moving && !state.reducedMotion ? Math.sin(state.phase * 11) * 3.4 : 0;
    ctx.beginPath();
    ctx.moveTo(origin.x - 2.5, baseY - 11);
    ctx.lineTo(origin.x - 2.5 + swing, baseY + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x + 2.5, baseY - 11);
    ctx.lineTo(origin.x + 2.5 - swing, baseY + 1);
    ctx.stroke();
  }

  // Torso.
  ctx.fillStyle = colours.top;
  ctx.beginPath();
  ctx.roundRect(origin.x - 8, bodyTop, 16, bodyHeight, [7, 7, 4, 4]);
  ctx.fill();
  // Shoulder highlight from the window side.
  ctx.fillStyle = shade(colours.top, 0.18);
  ctx.beginPath();
  ctx.roundRect(origin.x + 1, bodyTop + 1, 7, bodyHeight - 3, [5, 5, 3, 3]);
  ctx.fill();

  // Arms: forward on a table when working, relaxed otherwise.
  ctx.strokeStyle = colours.skin;
  ctx.lineWidth = 4;
  if (state.seated) {
    ctx.beginPath();
    ctx.moveTo(origin.x - 7, bodyTop + 8);
    ctx.lineTo(origin.x + facing * 10 - 2, bodyTop + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x + 7, bodyTop + 8);
    ctx.lineTo(origin.x + facing * 10 + 2, bodyTop + 15);
    ctx.stroke();
  } else {
    const swing = state.moving && !state.reducedMotion ? Math.sin(state.phase * 11) * 2.6 : 0;
    ctx.beginPath();
    ctx.moveTo(origin.x - 7, bodyTop + 6);
    ctx.lineTo(origin.x - 9 - swing * 0.4, bodyTop + 19 + swing);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(origin.x + 7, bodyTop + 6);
    ctx.lineTo(origin.x + 9 + swing * 0.4, bodyTop + 19 - swing);
    ctx.stroke();
  }

  // Head.
  const headY = bodyTop - 8;
  ctx.fillStyle = colours.skin;
  ctx.beginPath();
  ctx.ellipse(origin.x + facing * 1.2, headY, 8, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair: a cap that shifts with the facing so turns are readable.
  ctx.fillStyle = colours.hair;
  ctx.beginPath();
  ctx.ellipse(origin.x + facing * 1.2, headY - 2.4, 8.2, 6.6, 0, Math.PI, 0);
  ctx.fill();
  if (!facesCamera(state.direction)) {
    // Looking away: the back of the head is mostly hair.
    ctx.beginPath();
    ctx.ellipse(origin.x + facing * 1.2, headY + 0.5, 8, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = PALETTE.espresso;
    ctx.beginPath();
    ctx.ellipse(origin.x + facing * 1.2 - 2.6, headY + 1, 1.1, 1.4, 0, 0, Math.PI * 2);
    ctx.ellipse(origin.x + facing * 1.2 + 2.6, headY + 1, 1.1, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Name plate with status and microphone state. Every signal is shape + text as
 * well as colour, so the UI never depends on colour alone (SPEC 10.2, 16.3).
 */
export function drawNamePlate(
  ctx: CanvasRenderingContext2D,
  state: AvatarRenderState,
  worldScale = 1,
): void {
  const origin = worldToScreen(state.x, state.y);
  const top = origin.y - (state.seated ? 72 : 80);

  const label = state.isNpc ? `${state.displayName} · NPC` : state.displayName;
  const micGlyph = state.mutedByViewer ? '⊘' : state.micOn ? '●' : state.inVoiceGroup ? '◦' : '';
  const text = `${label}${micGlyph ? ` ${micGlyph}` : ''}`;

  // A name is read, not looked at: when the room zooms out on a small screen
  // the plate cancels the zoom out again and stays the same size on glass.
  // Everything below is therefore drawn in plate-local pixels around the
  // avatar's head, not in world pixels.
  ctx.save();
  ctx.translate(origin.x, top);
  if (worldScale !== 1) ctx.scale(1 / worldScale, 1 / worldScale);

  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  // Room for the plate text plus the status icon drawn to the left of it.
  const width = ctx.measureText(text).width + ICON_SIZE + 20;

  ctx.fillStyle = state.isSelf ? 'rgba(197, 139, 90, 0.92)' : 'rgba(43, 33, 28, 0.78)';
  ctx.beginPath();
  ctx.roundRect(-width / 2, 0, width, 18, 9);
  ctx.fill();

  if (state.micOn && !state.mutedByViewer) {
    // A live microphone is always visible, never implied (SPEC 6.2, 14.2).
    ctx.strokeStyle = 'rgba(232, 180, 120, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const ink = state.isSelf ? '#2b211c' : PALETTE.cream;
  const left = -width / 2 + 7;

  drawStatusIcon(ctx, state, left, 9.5, ink);

  ctx.fillStyle = ink;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + ICON_SIZE + 5, 9.5);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/**
 * Stroke the same Lucide icon the People panel renders, straight onto the
 * canvas. Path2D understands SVG path data, so the DOM and the canvas draw
 * from one definition in `icons/statusIcons` and cannot drift apart.
 */
function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  state: AvatarRenderState,
  x: number,
  centreY: number,
  colour: string,
): void {
  const paths = state.isNpc ? npcIconPaths() : statusIconPaths(state.status);
  const scale = ICON_SIZE / ICON_VIEWBOX;

  ctx.save();
  ctx.translate(x, centreY - ICON_SIZE / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = colour;
  // The context is scaled to the 24-unit grid, so divide to keep the drawn
  // stroke at a constant on-screen weight.
  ctx.lineWidth = ICON_STROKE_ON_SCREEN / scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of paths) ctx.stroke(path);
  ctx.restore();
}
