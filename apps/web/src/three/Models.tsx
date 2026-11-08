'use client';

import { Component, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MapObject, SeatDefinition } from '@virtual-cafe/shared';
import { seatDrawPosition, yawOf } from './materials';

/**
 * Kenney "Furniture Kit" models (CC0, kenney.nl) in /public/models/kenney.
 *
 * Each model is fitted to its footprint on the map rather than trusted for
 * scale: its bounding box is measured once, centred, set on the floor and
 * scaled so its width and depth fill the tiles (height follows by
 * `heightOf`, or keeps the model's own proportion). So any .glb can be
 * dropped in without hand-tuning, and the hit boxes, collision and seats —
 * which still come from the map — stay exactly where they were.
 *
 * Anything without a model, or whose model fails to load, keeps the
 * procedural low-poly version (see Room.tsx).
 */
const BASE = '/models/kenney/';

/** Poly Haven models (CC0, polyhaven.com) in /public/models/polyhaven. */
export type PolyHavenModel = 'armchair' | 'ceiling_lamp' | 'plant_large' | 'plant_small' | 'table_round' | 'table_wood';
const POLYHAVEN = new Set<string>(['armchair', 'ceiling_lamp', 'plant_large', 'plant_small', 'table_round', 'table_wood']);

export type ModelName =
  | PolyHavenModel
  | 'tableCoffee'
  | 'stoolBar'
  | 'loungeSofa'
  | 'kitchenBar'
  | 'kitchenCoffeeMachine'
  | 'kitchenBlender'
  | 'bookcaseOpen'
  | 'trashcan'
  | 'lampRoundFloor'
  | 'rugRectangle'
  | 'rugDoormat';

export const url = (name: ModelName) =>
  POLYHAVEN.has(name) ? `/models/polyhaven/${name}.glb` : `${BASE}${name}.glb`;

interface Fit {
  model: ModelName;
  /** Target height in world units; omitted = keep the model's proportions. */
  height?: number;
  /** Lift off the floor (e.g. on top of the counter). */
  y?: number;
  /** Extra turn, in quarter turns, for models authored facing another way. */
  turn?: number;
  /** Shrink the footprint (0..1) so it does not touch the tile edges. */
  inset?: number;
}

/** Map object kind → model. Kinds not listed stay procedural. */
export const OBJECT_MODELS: Partial<Record<MapObject['kind'], Fit>> = {
  // Poly Haven (textured): round tables for the small ones, a wooden
  // trestle table stretched over the group and community tables.
  table_small: { model: 'table_round', height: 0.74, inset: 0.92 },
  table_group: { model: 'table_wood', height: 0.74, inset: 0.94 },
  table_community: { model: 'table_wood', height: 0.74, inset: 0.96 },
  coffee_table: { model: 'tableCoffee', height: 0.4, inset: 0.8 },
  sofa: { model: 'loungeSofa', height: 0.9, inset: 1, turn: 2 },
  counter: { model: 'kitchenBar', height: 1.05, inset: 1 },
  espresso_machine: { model: 'kitchenCoffeeMachine', height: 0.5, y: 1.05, inset: 0.7 },
  grinder: { model: 'kitchenBlender', height: 0.4, y: 1.05, inset: 0.5 },
  bookshelf: { model: 'bookcaseOpen', height: 2.1, inset: 0.95 },
  display_shelf: { model: 'bookcaseOpen', height: 1.6, inset: 0.95 },
  plant_large: { model: 'plant_large', height: 1.5, inset: 0.8 },
  plant_small: { model: 'plant_small', height: 0.7, inset: 0.6 },
  trash_bin: { model: 'trashcan', height: 0.55, inset: 0.45 },
  floor_lamp: { model: 'lampRoundFloor', height: 1.8, inset: 0.45 },
  rug: { model: 'rugRectangle', inset: 0.92 },
  door_mat: { model: 'rugDoormat', inset: 0.8 },
};

/** Seat type → model. The sofa's seats are part of the sofa model. */
export const SEAT_MODELS: Partial<Record<SeatDefinition['seatType'], Fit>> = {
  // Every chair in the room is the Poly Haven armchair (front faces +Z, so it
  // gets a half turn back relative to the Kenney models). Bar stools stay.
  chair: { model: 'armchair', height: 0.9, inset: 0.66, turn: 2 },
  stool: { model: 'stoolBar', height: 0.8, inset: 0.45 },
  armchair: { model: 'armchair', height: 0.95, inset: 0.82, turn: 2 },
};

// ------------------------------------------------------------- fitting

interface Prepared {
  scene: THREE.Object3D;
  size: THREE.Vector3;
  centre: THREE.Vector3;
  min: THREE.Vector3;
}

/**
 * One palette for the whole café: dark walnut → caramel → cream.
 *
 * Flat-coloured kit models (Kenney) are re-coloured by brightness onto this
 * ramp, so every piece of wood, metal and plastic reads as part of the same
 * warm room. Textured models (Poly Haven) keep their texture and are
 * multiplied by a per-model tint that pulls them onto the same tones.
 */
const RAMP = ['#3e2719', '#6b4329', '#9a6a44', '#c49a6c', '#e2c9a4'].map((hex) => new THREE.Color(hex));
const PLANT = new THREE.Color('#5f7a45');

interface Tint {
  /** Multiplier colour. */
  tint: string;
  /** Brightness multiplier (>1 lifts dark textures). */
  boost?: number;
  /** Per-material override, matched by substring of the material name. */
  materials?: Record<string, { tint: string; boost?: number }>;
}

const MODEL_TINTS: Partial<Record<ModelName, Tint>> = {
  // Poly Haven
  table_round: { tint: '#ffd6a8', boost: 1.9 },
  table_wood: { tint: '#e8c9a6', boost: 0.95 },
  armchair: {
    tint: '#f2d4b0',
    materials: { pillow: { tint: '#e3a36c', boost: 1.0 }, legs: { tint: '#f0cfa8', boost: 1.1 } },
  },
  plant_large: { tint: '#fff0dc' },
  plant_small: { tint: '#fff0dc' },
  ceiling_lamp: { tint: '#ffe2c0' },
  // Kenney, given a material colour instead of the ramp
  loungeSofa: { tint: '#8a5434' },
  rugRectangle: { tint: '#b58c68' },
  rugDoormat: { tint: '#6f5038' },
};

function tintOf(name: ModelName, materialName: string): THREE.Color | null {
  const entry = MODEL_TINTS[name];
  if (!entry) return null;
  const override = Object.entries(entry.materials ?? {}).find(([key]) => materialName.toLowerCase().includes(key));
  const pick = override ? override[1] : entry;
  return new THREE.Color(pick.tint).multiplyScalar(pick.boost ?? 1);
}

function rampColour(colour: THREE.Color, tint: THREE.Color | null): void {
  const hsl = { h: 0, s: 0, l: 0 };
  colour.getHSL(hsl);
  if (tint) {
    // Keep the model's own light/dark parts, in the tint's colour.
    colour.copy(tint).multiplyScalar(0.55 + 0.9 * hsl.l);
    return;
  }
  if (hsl.s > 0.18 && hsl.h > 0.17 && hsl.h < 0.5) {
    colour.copy(PLANT).multiplyScalar(0.7 + 0.6 * hsl.l);
    return;
  }
  const at = THREE.MathUtils.clamp(hsl.l, 0, 0.999) * (RAMP.length - 1);
  const i = Math.floor(at);
  colour.copy(RAMP[i]).lerp(RAMP[Math.min(i + 1, RAMP.length - 1)], at - i);
}

function prepare(source: THREE.Object3D, name: ModelName): Prepared {
  const scene = source.clone(true);
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      // Materials are shared by every copy of a model: tint each only once.
      if (!('roughness' in standard) || standard.userData.warm) continue;
      standard.userData.warm = true;
      // Textured (Poly Haven) models already carry real wood, fabric and
      // leaves: keep their look, only warm it slightly so it sits in the room.
      const tint = tintOf(name, standard.name ?? '');
      if (standard.map) {
        standard.map.anisotropy = 4;
        standard.color?.copy(tint ?? new THREE.Color('#fff1e0'));
        standard.metalness = Math.min(standard.metalness ?? 0, 0.2);
        standard.needsUpdate = true;
        continue;
      }
      if (standard.color) rampColour(standard.color, tint);
      // Matte and faceted like the rest of the room.
      standard.roughness = Math.max(standard.roughness ?? 0.8, 0.75);
      standard.metalness = 0;
      standard.flatShading = true;
      standard.needsUpdate = true;
    }
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  return { scene, size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()), min: box.min.clone() };
}

/**
 * One fitted instance: `w`×`d` tiles, centred at (cx, cz), facing `yaw`.
 * Footprint fit uses the rotated axes so a model turned 90° still fills it.
 */
function Fitted({
  name,
  fit,
  cx,
  cz,
  w,
  d,
  yaw = 0,
}: {
  name: ModelName;
  fit: Fit;
  cx: number;
  cz: number;
  w: number;
  d: number;
  yaw?: number;
}) {
  const gltf = useGLTF(url(name));
  const prepared = useMemo(() => prepare(gltf.scene, name), [gltf.scene, name]);
  const turn = (fit.turn ?? 0) * (Math.PI / 2);
  const total = yaw + turn;
  // Footprint in the model's own axes: swap when it ends up turned sideways.
  const sideways = Math.abs(Math.round(total / (Math.PI / 2))) % 2 === 1;
  const targetX = (sideways ? d : w) * (fit.inset ?? 0.9);
  const targetZ = (sideways ? w : d) * (fit.inset ?? 0.9);
  const sx = targetX / Math.max(prepared.size.x, 1e-3);
  const sz = targetZ / Math.max(prepared.size.z, 1e-3);
  const sy = fit.height ? fit.height / Math.max(prepared.size.y, 1e-3) : Math.min(sx, sz);
  return (
    <group position={[cx, fit.y ?? 0, cz]} rotation={[0, total, 0]}>
      <group scale={[sx, sy, sz]}>
        <primitive
          object={useMemo(() => prepared.scene.clone(true), [prepared])}
          position={[-prepared.centre.x, -prepared.min.y, -prepared.centre.z]}
        />
      </group>
    </group>
  );
}

// ------------------------------------------------- safety around loading

/** Any load error falls back to the procedural shape. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[3d] model failed to load, using the built-in shape', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ObjectModel({ o, fallback }: { o: MapObject; fallback: ReactNode }) {
  const fit = OBJECT_MODELS[o.kind];
  if (!fit) return <>{fallback}</>;
  // Long objects (counter, sofa, community table) are authored along x;
  // turn them to run along whichever axis the map object is longer in.
  const alongZ = o.h > o.w;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Fitted
          name={fit.model}
          fit={fit}
          cx={o.x + o.w / 2}
          cz={o.y + o.h / 2}
          w={o.w}
          d={o.h}
          yaw={alongZ ? Math.PI / 2 : 0}
        />
      </Suspense>
    </ModelBoundary>
  );
}

export function SeatModel({ seat, fallback }: { seat: SeatDefinition; fallback: ReactNode }) {
  const fit = SEAT_MODELS[seat.seatType];
  if (!fit) return <>{fallback}</>;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Fitted
          name={fit.model}
          fit={fit}
          cx={seatDrawPosition(seat).x}
          cz={seatDrawPosition(seat).z}
          w={1}
          d={1}
          yaw={yawOf(seat.facing) + Math.PI}
        />
      </Suspense>
    </ModelBoundary>
  );
}

/** A pendant shade from the kit, for the hanging lamps. */
export function PendantModel({ x, z, fallback }: { x: number; z: number; fallback: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Fitted name="ceiling_lamp" fit={{ model: 'ceiling_lamp', height: 0.7, y: 2.3, inset: 0.4 }} cx={x} cz={z} w={1} d={1} />
      </Suspense>
    </ModelBoundary>
  );
}

/** Start every download at once, so the room fills in together. */
export function preloadModels(): void {
  const names = new Set<ModelName>(['ceiling_lamp']);
  for (const fit of Object.values(OBJECT_MODELS)) if (fit) names.add(fit.model);
  for (const fit of Object.values(SEAT_MODELS)) if (fit) names.add(fit.model);
  for (const name of names) useGLTF.preload(url(name));
}
