/**
 * Art direction (SPEC 5.1): wood, stone, fabric, matte metal, glass and
 * greenery. Warm light from the window wall, one coffee accent, no neon.
 */

export const PALETTE = {
  floorWood: ['#a97d55', '#a27650', '#9c7049', '#b0835b'],
  floorWoodDark: '#8a6342',
  floorStone: '#cfc4b4',
  grout: '#8f6a48',
  wallInner: '#e4d6c2',
  wallInnerShade: '#d3c2aa',
  wallTrim: '#bca787',
  glass: '#c3d2d2',
  glassLow: '#9ab0b2',
  outside: '#9fb0ad',
  outsideFar: '#c3cfc8',

  woodTop: '#b98a5e',
  woodSide: '#956b46',
  woodDark: '#6f4f34',
  walnutTop: '#8a6446',
  walnutSide: '#6d4e36',

  fabricTop: '#d8bd96',
  fabricSide: '#bb9f78',
  sofaTop: '#ad8c63',
  sofaSide: '#8d7050',

  metal: '#9aa0a2',
  metalDark: '#6f7577',
  ceramic: '#f2ece2',
  plant: '#6b7355',
  plantLight: '#8d9a6c',
  plantDark: '#4d5640',
  pot: '#b07a55',

  espresso: '#2b211c',
  cream: '#f5ece0',
  linen: '#e8dcca',

  shadow: 'rgba(58, 40, 28, 0.22)',
  warmLight: 'rgba(255, 208, 138, 0.16)',
  accent: '#c58b5a',
  seatFree: 'rgba(197, 139, 90, 0.85)',
  seatTaken: 'rgba(120, 110, 100, 0.45)',
} as const;

export const WALL_HEIGHT = 132;

/** Deterministic 0..1 noise so floor variation is stable between frames. */
export function hash2(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Lighten or darken a colour. Accepts both `#rrggbb` and the `rgb(...)` this
 * function itself returns, so shading a shaded colour keeps working.
 */
export function shade(colour: string, amount: number): string {
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  let r: number;
  let g: number;
  let b: number;

  if (colour.startsWith('#')) {
    const num = Number.parseInt(colour.slice(1), 16);
    r = (num >> 16) & 0xff;
    g = (num >> 8) & 0xff;
    b = num & 0xff;
  } else {
    const parts = colour.match(/-?\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return colour;
    [r, g, b] = parts.slice(0, 3).map(Number);
  }

  return `rgb(${clamp(r * (1 + amount))}, ${clamp(g * (1 + amount))}, ${clamp(b * (1 + amount))})`;
}
