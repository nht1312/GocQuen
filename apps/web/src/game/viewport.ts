import { MAP_HEIGHT, MAP_WIDTH, worldToScreen } from '@virtual-cafe/shared';
import { WALL_HEIGHT } from './palette';

/**
 * How much of the room a given viewport should show.
 *
 * The café is a wide, shallow box — about 1470 x 870 CSS pixels of floor,
 * walls and furniture. A laptop window shows a useful slice of that at 1:1, so
 * it is left alone; a phone held upright would otherwise see barely a quarter
 * of the width and lose any sense of where the tables are.
 */

/** Breathing room kept between the walls and the edge of the viewport. */
export const SCENE_MARGIN = 48;

/** The viewport the zoom aims to fill, in CSS pixels. */
const REFERENCE_WIDTH = 640;
const REFERENCE_HEIGHT = 560;

/** Below this the furniture turns to mush, so the zoom stops here. */
export const MIN_WORLD_SCALE = 0.75;

/**
 * The room's bounding box in unzoomed screen pixels, margin included. The
 * camera clamps against these edges and the zoom refuses to show more than
 * them, so both read the room's size from here rather than each deriving it.
 */
export function sceneExtent(): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = worldToScreen(0, MAP_HEIGHT).x;
  const right = worldToScreen(MAP_WIDTH, 0).x;
  const top = worldToScreen(0, 0).y - WALL_HEIGHT;
  const bottom = worldToScreen(MAP_WIDTH, MAP_HEIGHT).y;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left + SCENE_MARGIN * 2,
    height: bottom - top + SCENE_MARGIN * 2,
  };
}

/**
 * Zoom for a viewport: 1 wherever the room already reads, shrinking towards
 * {@link MIN_WORLD_SCALE} on small screens.
 *
 * Two floors, not one. The hard floor keeps the furniture legible; the second
 * is that zooming out past the whole room buys nothing — on a tall phone the
 * room runs out of height long before it runs out of width, and the extra zoom
 * would only pad the picture with empty background above and below it. Name
 * plates cancel the zoom out again so they stay the same size on glass (see
 * `drawNamePlate`).
 */
export function worldScaleFor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;

  const scene = sceneExtent();
  const fit = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  const wholeRoom = Math.max(width / scene.width, height / scene.height);
  const floor = Math.max(MIN_WORLD_SCALE, Math.min(1, wholeRoom));

  return Math.min(1, Math.max(floor, fit));
}
