/**
 * Status icons, as raw SVG path data.
 *
 * Source: Lucide (https://lucide.dev), version 0.544.0, ISC licensed.
 *
 *   ISC License
 *   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as
 *   part of Feather (MIT). All other copyright (c) for Lucide are held by
 *   Lucide Contributors 2025.
 *   Permission to use, copy, modify, and/or distribute this software for any
 *   purpose with or without fee is hereby granted, provided that the above
 *   copyright notice and this permission notice appear in all copies.
 *
 * Every icon comes from the one set, so they share a 24x24 grid, a 2px stroke
 * and round caps and joins — the consistency is structural, not eyeballed.
 *
 * Why path strings rather than SVG files: the same status is drawn twice, as
 * DOM in the People panel and on the canvas in avatar name plates. Canvas2D
 * can stroke these directly via `new Path2D(d)`, so both surfaces render from
 * this one definition and cannot drift apart.
 *
 * `<circle>` elements from the originals are expressed here as the equivalent
 * two-arc path, which Path2D understands.
 */
import type { PlayerStatus } from '@virtual-cafe/shared';

/** All icons are authored on this grid. */
export const ICON_VIEWBOX = 24;
export const ICON_STROKE_WIDTH = 2;

const CIRCLE_12_12_10 = 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0';

/** Lucide `circle-check` — free and open to being approached. */
const AVAILABLE = [CIRCLE_12_12_10, 'm9 12 2 2 4-4'];

/** Lucide `laptop` — heads-down on something. */
const WORKING = [
  'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z',
  'M20.054 15.987H3.946',
];

/** Lucide `headphones` — please do not interrupt. */
const FOCUS = [
  'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
];

/** Lucide `clock` — stepped out, back later. */
const AWAY = ['M12 6v6l4 2', CIRCLE_12_12_10];

/** Lucide `message-circle` — talking at a table. */
const IN_CONVERSATION = [
  'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
];

/** Lucide `coffee` — an ambient café regular, not a real person. */
export const NPC_ICON_PATHS = [
  'M10 2v2',
  'M14 2v2',
  'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
  'M6 2v2',
];

export const STATUS_ICON_PATHS: Record<PlayerStatus, string[]> = {
  available: AVAILABLE,
  working: WORKING,
  focus: FOCUS,
  away: AWAY,
  in_conversation: IN_CONVERSATION,
};
