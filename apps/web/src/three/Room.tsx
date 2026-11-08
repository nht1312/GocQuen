'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  MAP_HEIGHT,
  MAP_OBJECTS,
  MAP_WIDTH,
  SEAT_DEFINITIONS,
  WALL_DECOR,
} from '@virtual-cafe/shared';
import type { MapObject, SeatDefinition } from '@virtual-cafe/shared';
import { PALETTE, hash2 } from '@/game/palette';
import { mat, seatDrawPosition, yawOf } from './materials';
import { ObjectModel, PendantModel, SeatModel, preloadModels } from './Models';
import { USE_MODELS } from '@/lib/flags';

export const WALL_H = 3;

/** Axis-aligned box by its minimum corner: x/z on the floor, y up. */
function Box({
  x,
  y,
  z,
  w,
  h,
  d,
  color,
  opacity,
  emissive,
  shadow = true,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  opacity?: number;
  emissive?: number;
  shadow?: boolean;
}) {
  return (
    <mesh
      position={[x + w / 2, y + h / 2, z + d / 2]}
      castShadow={shadow && (opacity ?? 1) >= 1}
      receiveShadow
      material={mat(color, { opacity, emissive: emissive ? color : undefined, emissiveIntensity: emissive })}
    >
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
}

function Cyl({
  x,
  y,
  z,
  r,
  r2,
  h,
  color,
  seg = 7,
  emissive,
}: {
  x: number;
  y: number;
  z: number;
  r: number;
  r2?: number;
  h: number;
  color: string;
  seg?: number;
  emissive?: number;
}) {
  return (
    <mesh
      position={[x, y + h / 2, z]}
      castShadow
      receiveShadow
      material={mat(color, { emissive: emissive ? color : undefined, emissiveIntensity: emissive })}
    >
      <cylinderGeometry args={[r, r2 ?? r, h, seg]} />
    </mesh>
  );
}

function Blob({ x, y, z, r, color, sy = 1 }: { x: number; y: number; z: number; r: number; color: string; sy?: number }) {
  return (
    <mesh position={[x, y, z]} scale={[1, sy, 1]} castShadow receiveShadow material={mat(color)}>
      <icosahedronGeometry args={[r, 0]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ floor

/**
 * Oak veneer floor (Poly Haven, CC0) from /public/textures, one texture
 * repeat per two tiles, warmed to the café's walnut tone.
 */
function useOakTextures() {
  return useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (url: string, colour: boolean) => {
      const texture = loader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set((MAP_WIDTH - 2) / 2, (MAP_HEIGHT - 2) / 2);
      texture.anisotropy = 8;
      if (colour) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    return { map: load('/textures/oak_veneer_diff.jpg', true), normal: load('/textures/oak_veneer_nor.jpg', false) };
  }, []);
}

function Floor() {
  const oak = useOakTextures();
  return (
    <>
      <Box x={0.8} y={-0.16} z={0.8} w={MAP_WIDTH - 1.8} h={0.06} d={MAP_HEIGHT - 1.8} color={PALETTE.grout} shadow={false} />
      <mesh position={[MAP_WIDTH / 2, 0, MAP_HEIGHT / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH - 2, MAP_HEIGHT - 2]} />
        <meshStandardMaterial
          map={oak.map}
          normalMap={oak.normal}
          normalScale={new THREE.Vector2(0.6, 0.6)}
          color="#f2cfa6"
          roughness={0.7}
          metalness={0}
        />
      </mesh>
    </>
  );
}

// ------------------------------------------------------------------ walls

function useSignTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = PALETTE.espresso;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = PALETTE.accent;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 76;
    do {
      g.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
      size -= 2;
    } while (size > 20 && g.measureText('GÓC QUEN').width > 450);
    g.fillText('GÓC QUEN', 256, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);
}

const NORTH_WINDOW = WALL_DECOR.find((decor) => decor.kind === 'window');
/** The window opening in the north wall, shared with the weather view. */
export const WINDOW_BOX = {
  from: NORTH_WINDOW?.from ?? 4,
  to: NORTH_WINDOW?.to ?? 21,
  sill: 0.35,
  head: 2.7,
  wallZ: 0.8,
  thickness: 0.2,
};

const WINDOW_PANES = 4;

function GamingNeon() {
  const decor = WALL_DECOR.find((d) => d.kind === 'neon');
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#1d1726';
    g.fillRect(0, 0, 512, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 54px ui-sans-serif, system-ui, sans-serif';
    g.shadowColor = '#a866ff';
    g.shadowBlur = 18;
    g.fillStyle = '#e2d0ff';
    g.fillText('KHU CHƠI GAME', 256, 66);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, []);
  if (!decor) return null;
  return (
    <mesh position={[(decor.from + decor.to) / 2, 2.1, 0.8 + 0.2 + 0.03]}>
      <planeGeometry args={[decor.to - decor.from - 0.8, 0.9]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function Walls() {
  const sign = useSignTexture();
  const north = WALL_DECOR.find((decor) => decor.kind === 'window');
  const signDecor = WALL_DECOR.find((decor) => decor.kind === 'sign');
  const winFrom = north?.from ?? 4;
  const winTo = north?.to ?? 21;
  const sill = 0.35;
  const head = 2.7;
  const wallZ = 0.8;
  const wallX = 0.8;
  const t = 0.2;
  const trim = PALETTE.wallTrim;

  const mullions = [];
  for (let pane = 0; pane <= WINDOW_PANES; pane += 1) {
    const x = winFrom + ((winTo - winFrom) * pane) / WINDOW_PANES;
    mullions.push(<Box key={`m${pane}`} x={x - 0.05} y={sill} z={wallZ + t - 0.06} w={0.1} h={head - sill} d={0.1} color={trim} />);
  }

  return (
    <group>
      {/* North wall (y = 0 row), cut around the window. */}
      <Box x={wallX} y={0} z={wallZ} w={winFrom - wallX} h={WALL_H} d={t} color={PALETTE.wallInner} />
      <Box x={winTo} y={0} z={wallZ} w={MAP_WIDTH - 1 - winTo} h={WALL_H} d={t} color={PALETTE.wallInner} />
      <Box x={winFrom} y={0} z={wallZ} w={winTo - winFrom} h={sill} d={t} color={PALETTE.wallInner} />
      <Box x={winFrom} y={head} z={wallZ} w={winTo - winFrom} h={WALL_H - head} d={t} color={PALETTE.wallInner} />

      {/* The street beyond the glass is drawn by Atmosphere (live weather). */}
      <mesh position={[(winFrom + winTo) / 2, (sill + head) / 2, wallZ + t - 0.02]}>
        <planeGeometry args={[winTo - winFrom, head - sill]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.08} roughness={0.1} depthWrite={false} />
      </mesh>
      {mullions}
      <Box x={winFrom} y={sill - 0.06} z={wallZ + t - 0.06} w={winTo - winFrom} h={0.08} d={0.16} color={trim} />
      <Box x={winFrom} y={head} z={wallZ + t - 0.06} w={winTo - winFrom} h={0.08} d={0.1} color={trim} />

      {/* Khu Chơi Game neon. */}
      <GamingNeon />

      {/* Sign. */}
      {signDecor ? (
        <mesh position={[(signDecor.from + signDecor.to) / 2, 2.35, wallZ + t + 0.03]}>
          <planeGeometry args={[signDecor.to - signDecor.from - 0.1, 0.5]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      ) : null}

      {/* West wall (x = 0 column). */}
      <Box x={wallX} y={0} z={wallZ} w={t} h={WALL_H} d={MAP_HEIGHT - 1 - wallZ} color={PALETTE.wallInnerShade} />
      {/* Skirting. */}
      <Box x={wallX} y={0} z={wallZ + t} w={MAP_WIDTH - 1 - wallX} h={0.12} d={0.04} color={trim} shadow={false} />
      <Box x={wallX + t} y={0} z={wallZ} w={0.04} h={0.12} d={MAP_HEIGHT - 1 - wallZ} color={trim} shadow={false} />

      {WALL_DECOR.filter((decor) => decor.wall === 'west').map((decor) => {
        const z0 = decor.from;
        const z1 = decor.to;
        if (decor.kind === 'menu_board') {
          return <Box key={decor.id} x={wallX + t} y={1.6} z={z0} w={0.05} h={0.9} d={z1 - z0} color={PALETTE.espresso} />;
        }
        if (decor.kind === 'clock') {
          return (
            <mesh key={decor.id} position={[wallX + t + 0.03, 2.2, (z0 + z1) / 2]} rotation={[0, 0, Math.PI / 2]} material={mat(PALETTE.ceramic)}>
              <cylinderGeometry args={[0.28, 0.28, 0.05, 10]} />
            </mesh>
          );
        }
        if (decor.kind === 'art') {
          return (
            <group key={decor.id}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  x={wallX + t}
                  y={1.5 + (i % 2) * 0.2}
                  z={z0 + 0.15 + i * ((z1 - z0) / 3)}
                  w={0.04}
                  h={0.6}
                  d={0.7}
                  color={['#a8663c', '#6b7355', '#c58b5a'][i]}
                />
              ))}
            </group>
          );
        }
        return null;
      })}

      {/* Entrance door on the west wall by the mat. */}
      <Box x={wallX + t} y={0} z={15.9} w={0.06} h={2.2} d={2.2} color={PALETTE.woodDark} />
      <Box x={wallX + t + 0.02} y={0.9} z={17.8} w={0.08} h={0.06} d={0.18} color={PALETTE.metal} />
    </group>
  );
}

// -------------------------------------------------------------- furniture

function TableTop({ o, height, color }: { o: MapObject; height: number; color: string }) {
  const inset = o.kind === 'table_small' ? 0.1 : 0.06;
  return (
    <>
      <Box x={o.x + inset} y={height - 0.07} z={o.y + inset} w={o.w - inset * 2} h={0.07} d={o.h - inset * 2} color={color} />
      {o.w * o.h <= 1 ? (
        <Cyl x={o.x + o.w / 2} y={0} z={o.y + o.h / 2} r={0.06} h={height - 0.07} color={PALETTE.woodDark} seg={6} />
      ) : (
        [
          [o.x + 0.2, o.y + 0.2],
          [o.x + o.w - 0.2, o.y + 0.2],
          [o.x + 0.2, o.y + o.h - 0.2],
          [o.x + o.w - 0.2, o.y + o.h - 0.2],
        ].map(([lx, lz], i) => <Box key={i} x={lx - 0.04} y={0} z={lz - 0.04} w={0.08} h={height - 0.07} d={0.08} color={PALETTE.woodDark} />)
      )}
      {/* A cup, and a laptop on the bigger tables. */}
      <Cyl x={o.x + o.w * 0.65} y={height} z={o.y + o.h * 0.4} r={0.06} r2={0.05} h={0.1} color={PALETTE.ceramic} seg={7} />
      {o.w * o.h > 2 ? (
        <Box x={o.x + o.w * 0.25} y={height} z={o.y + o.h * 0.55} w={0.3} h={0.02} d={0.22} color={PALETTE.metal} />
      ) : null}
    </>
  );
}

function Furniture({ o }: { o: MapObject }) {
  const cx = o.x + o.w / 2;
  const cz = o.y + o.h / 2;
  switch (o.kind) {
    case 'counter':
      return (
        <>
          <Box x={o.x} y={0} z={o.y} w={o.w} h={1.0} d={o.h} color={PALETTE.woodSide} />
          <Box x={o.x - 0.05} y={1.0} z={o.y - 0.05} w={o.w + 0.1} h={0.08} d={o.h + 0.1} color={PALETTE.walnutTop} />
        </>
      );
    case 'espresso_machine':
      return (
        <>
          <Box x={o.x + 0.15} y={1.08} z={o.y + 0.2} w={0.7} h={0.5} d={0.6} color={PALETTE.metal} />
          <Box x={o.x + 0.25} y={1.58} z={o.y + 0.3} w={0.5} h={0.08} d={0.4} color="#8c3f2a" />
        </>
      );
    case 'grinder':
      return (
        <>
          <Box x={o.x + 0.32} y={1.08} z={o.y + 0.32} w={0.36} h={0.4} d={0.36} color={PALETTE.metalDark} />
          <Cyl x={cx} y={1.48} z={cz} r={0.18} r2={0.08} h={0.22} color="#5a4030" seg={6} />
        </>
      );
    case 'pastry_case':
      return (
        <>
          <Box x={o.x + 0.1} y={1.08} z={o.y + 0.1} w={0.8} h={0.42} d={0.8} color="#d8e6e8" opacity={0.35} />
          <Box x={o.x + 0.25} y={1.1} z={o.y + 0.3} w={0.2} h={0.1} d={0.2} color="#c58b5a" />
          <Box x={o.x + 0.55} y={1.1} z={o.y + 0.45} w={0.2} h={0.1} d={0.2} color="#e8c893" />
        </>
      );
    case 'display_shelf':
    case 'bookshelf': {
      const tall = o.kind === 'bookshelf' ? 2.1 : 1.6;
      return (
        <>
          <Box x={o.x + 0.05} y={0} z={o.y + 0.05} w={o.w - 0.1} h={tall} d={o.h - 0.1} color={PALETTE.woodDark} />
          {[0.5, 1.0, 1.5].filter((y) => y < tall).map((y, i) => (
            <Box
              key={i}
              x={o.x + 0.15}
              y={y}
              z={o.y + o.h - 0.12}
              w={o.w - 0.3}
              h={0.3}
              d={0.1}
              color={['#a8663c', '#6b7355', '#c58b5a'][i]}
            />
          ))}
        </>
      );
    }
    case 'table_small':
      return <TableTop o={o} height={0.72} color={PALETTE.woodTop} />;
    case 'table_group':
    case 'table_community':
      return <TableTop o={o} height={0.72} color={PALETTE.walnutTop} />;
    case 'coffee_table':
      return <TableTop o={o} height={0.4} color={PALETTE.woodTop} />;
    case 'sofa':
      return (
        <>
          <Box x={o.x} y={0} z={o.y} w={o.w} h={0.42} d={o.h} color={PALETTE.sofaSide} />
          <Box x={o.x} y={0.42} z={o.y} w={o.w} h={0.5} d={0.28} color={PALETTE.sofaTop} />
          <Box x={o.x} y={0.42} z={o.y} w={0.15} h={0.25} d={o.h} color={PALETTE.sofaTop} />
          <Box x={o.x + o.w - 0.15} y={0.42} z={o.y} w={0.15} h={0.25} d={o.h} color={PALETTE.sofaTop} />
          {Array.from({ length: o.w }, (_, i) => (
            <Box key={i} x={o.x + i + 0.08} y={0.42} z={o.y + 0.3} w={0.84} h={0.1} d={o.h - 0.36} color={PALETTE.fabricTop} />
          ))}
        </>
      );
    case 'plant_large':
      return (
        <>
          <Cyl x={cx} y={0} z={cz} r={0.28} r2={0.22} h={0.45} color={PALETTE.pot} seg={6} />
          <Blob x={cx} y={0.95} z={cz} r={0.45} color={PALETTE.plant} sy={1.2} />
          <Blob x={cx + 0.15} y={1.3} z={cz - 0.1} r={0.3} color={PALETTE.plantLight} />
        </>
      );
    case 'plant_small':
      return (
        <>
          <Cyl x={cx} y={0} z={cz} r={0.2} r2={0.16} h={0.3} color={PALETTE.pot} seg={6} />
          <Blob x={cx} y={0.55} z={cz} r={0.28} color={PALETTE.plantLight} />
        </>
      );
    case 'planter':
      return (
        <>
          <Box x={o.x + 0.05} y={0} z={o.y + 0.12} w={o.w - 0.1} h={0.5} d={o.h - 0.24} color={PALETTE.woodSide} />
          {Array.from({ length: o.w * 2 }, (_, i) => (
            <Blob key={i} x={o.x + 0.3 + i * 0.5} y={0.75} z={o.y + 0.5} r={0.3} color={i % 2 ? PALETTE.plantLight : PALETTE.plant} />
          ))}
        </>
      );
    case 'trash_bin':
      return <Cyl x={cx} y={0} z={cz} r={0.2} r2={0.17} h={0.5} color={PALETTE.metalDark} seg={8} />;
    case 'rug':
      return (
        <>
          <Box x={o.x + 0.1} y={0} z={o.y + 0.1} w={o.w - 0.2} h={0.02} d={o.h - 0.2} color="#9a7458" shadow={false} />
          <Box x={o.x + 0.4} y={0.02} z={o.y + 0.4} w={o.w - 0.8} h={0.01} d={o.h - 0.8} color="#b48e6c" shadow={false} />
        </>
      );
    case 'door_mat':
      return <Box x={o.x + 0.15} y={0} z={o.y + 0.1} w={o.w - 0.3} h={0.02} d={o.h - 0.2} color="#6f5a46" shadow={false} />;
    case 'hanging_lamp':
      return (
        <>
          <Cyl x={cx} y={2.45} z={cz} r={0.012} h={WALL_H - 2.45} color="#3c2e24" seg={4} />
          {USE_MODELS ? (
            <PendantModel
              x={cx}
              z={cz}
              fallback={<Cyl x={cx} y={2.25} z={cz} r={0.08} r2={0.26} h={0.2} color="#a8663c" seg={8} />}
            />
          ) : (
            <Cyl x={cx} y={2.25} z={cz} r={0.08} r2={0.26} h={0.2} color="#a8663c" seg={8} />
          )}
          {/* The bulb stays ours: Atmosphere drives its glow at night. */}
          <mesh position={[cx, 2.22, cz]} material={mat('#f2d6a6', { emissive: '#f2d6a6', emissiveIntensity: 0.5 })}>
            <icosahedronGeometry args={[0.07, 0]} />
          </mesh>
        </>
      );
    case 'floor_lamp':
      return (
        <>
          <Cyl x={cx} y={0} z={cz} r={0.16} h={0.04} color={PALETTE.metalDark} seg={8} />
          <Cyl x={cx} y={0.04} z={cz} r={0.025} h={1.5} color={PALETTE.metalDark} seg={5} />
          <Cyl x={cx} y={1.5} z={cz} r={0.14} r2={0.24} h={0.28} color="#e8c893" seg={8} emissive={0.25} />
        </>
      );
    default:
      return null;
  }
}

function Seat({ seat }: { seat: SeatDefinition }) {
  if (seat.seatType === 'sofa') return null; // part of the sofa itself
  const { x: cx, z: cz } = seatDrawPosition(seat);
  const yaw = yawOf(seat.facing);
  if (seat.seatType === 'stool') {
    return (
      <>
        <Cyl x={cx} y={0} z={cz} r={0.04} h={0.68} color={PALETTE.metalDark} seg={5} />
        <Cyl x={cx} y={0.68} z={cz} r={0.2} h={0.07} color={PALETTE.woodTop} seg={8} />
      </>
    );
  }
  const armchair = seat.seatType === 'armchair';
  return (
    <group position={[cx, 0, cz]} rotation={[0, yaw, 0]}>
      <mesh position={[0, armchair ? 0.2 : 0.42, 0]} castShadow receiveShadow material={mat(armchair ? PALETTE.sofaSide : PALETTE.woodTop)}>
        <boxGeometry args={[armchair ? 0.7 : 0.46, armchair ? 0.4 : 0.06, armchair ? 0.7 : 0.46]} />
      </mesh>
      <mesh position={[0, armchair ? 0.6 : 0.68, armchair ? -0.28 : -0.21]} castShadow material={mat(armchair ? PALETTE.sofaTop : PALETTE.woodSide)}>
        <boxGeometry args={[armchair ? 0.7 : 0.46, armchair ? 0.45 : 0.46, armchair ? 0.16 : 0.05]} />
      </mesh>
      {armchair ? null : (
        <mesh position={[0, 0.2, 0]} castShadow material={mat(PALETTE.woodDark)}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
        </mesh>
      )}
    </group>
  );
}

/** Everything that never moves: built once, never re-rendered. */
if (USE_MODELS && typeof window !== 'undefined') preloadModels();

export function Room() {
  return (
    <group>
      <Floor />
      <Walls />
      {MAP_OBJECTS.map((object) =>
        USE_MODELS && object.kind !== 'hanging_lamp' ? (
          <ObjectModel key={object.id} o={object} fallback={<Furniture o={object} />} />
        ) : (
          <Furniture key={object.id} o={object} />
        ),
      )}
      {SEAT_DEFINITIONS.map((seat) =>
        USE_MODELS ? (
          <SeatModel key={seat.seatId} seat={seat} fallback={<Seat seat={seat} />} />
        ) : (
          <Seat key={seat.seatId} seat={seat} />
        ),
      )}
    </group>
  );
}
