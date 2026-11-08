import * as THREE from 'three';
import type { Direction } from '@virtual-cafe/shared';

/**
 * Shared flat-shaded materials. Low-poly reads as "stylised" only when every
 * face is one colour, so `flatShading` is on everywhere and materials are
 * cached by colour: hundreds of meshes, a few dozen materials.
 */
const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(
  color: string,
  options: { opacity?: number; emissive?: string; emissiveIntensity?: number; roughness?: number } = {},
): THREE.MeshStandardMaterial {
  const opacity = options.opacity ?? 1;
  const key = `${color}|${opacity}|${options.emissive ?? ''}|${options.emissiveIntensity ?? 0}|${options.roughness ?? 0.85}`;
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.85,
      metalness: 0,
      flatShading: true,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      emissive: options.emissive ?? '#000000',
      emissiveIntensity: options.emissiveIntensity ?? 0,
    });
    cache.set(key, material);
  }
  return material;
}

/** Screen-space facing names → a unit vector in world (x, z). */
const SCREEN: Record<Direction, [number, number]> = {
  north: [0, -1],
  north_east: [1, -1],
  east: [1, 0],
  south_east: [1, 1],
  south: [0, 1],
  south_west: [-1, 1],
  west: [-1, 0],
  north_west: [-1, -1],
};

export function directionToWorld(direction: Direction): { x: number; z: number } {
  const [sx, sy] = SCREEN[direction] ?? [0, 1];
  // Inverse of the 2:1 isometric projection (shared/iso.ts).
  const x = sx / 64 + sy / 32;
  const z = sy / 32 - sx / 64;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

/**
 * Seat tiles are one whole tile away from their table, which left a gap
 * between chair and table. Chairs (and the avatar sitting on them) are drawn
 * pulled in towards the table by this much. Visual only — the map, the
 * server's reach check and collision still use the tile.
 */
export const SEAT_PULL: Record<string, number> = { chair: 0.22, stool: 0.18, armchair: 0.12, sofa: 0 };

export function seatDrawPosition(seat: { x: number; y: number; facing: Direction; seatType: string }): {
  x: number;
  z: number;
} {
  const pull = SEAT_PULL[seat.seatType] ?? 0;
  const v = directionToWorld(seat.facing);
  return { x: seat.x + 0.5 + v.x * pull, z: seat.y + 0.5 + v.z * pull };
}

/** Rotation about Y that turns a model's local +Z towards `direction`. */
export function yawOf(direction: Direction): number {
  const v = directionToWorld(direction);
  return Math.atan2(v.x, v.z);
}
