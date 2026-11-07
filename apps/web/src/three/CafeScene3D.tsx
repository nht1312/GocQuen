'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AVATAR_PRESETS, MAP_HEIGHT, MAP_WIDTH, SEATS_BY_ID } from '@virtual-cafe/shared';
import type { SeatType } from '@virtual-cafe/shared';
import type { CafeEngine } from '@/game/engine';
import type { AvatarRenderState } from '@/game/avatar';
import { onTable, tableCentre } from '@/game/tableHit';
import { useKeyboardInput } from '@/game/useKeyboardInput';
import { useCafeStore } from '@/state/useCafeStore';
import { mat, yawOf } from './materials';
import { Room } from './Room';
import { Atmosphere } from './Atmosphere';
import { FPS_WINDOW, MIN_FPS, QUALITY, initialTier } from './quality';
import type { QualityTier } from './quality';
import { NamePlates } from './NamePlates';
import type { AvatarRef, PlateRegistry } from './NamePlates';

interface Props {
  engineRef: React.MutableRefObject<CafeEngine | null>;
  touchVectorRef?: React.MutableRefObject<{ x: number; y: number } | null>;
  onSit: (seatId?: string) => void;
  onStand: () => void;
  onInteract: () => void;
  onOwnTableHover?: (anchor: { x: number; y: number } | null) => void;
}

/** World (x, y) on the floor ↔ three.js (x, 0, z). One tile = one unit. */
const CENTRE = new THREE.Vector3(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
/** Classic isometric: 45° around, ~35° down. */
const ISO_DIRECTION = new THREE.Vector3(1, 0.82, 1).normalize();
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ------------------------------------------------------------- camera

function IsoCamera({ engineRef }: { engineRef: Props['engineRef'] }) {
  const { camera, size } = useThree();
  const focus = useRef(CENTRE.clone());
  useFrame((_, delta) => {
    const ortho = camera as THREE.OrthographicCamera;
    // Fit about 16 tiles across the shorter axis on a laptop, more on a phone.
    const tiles = size.width < 640 ? 13 : 17;
    ortho.zoom = Math.min(size.width, size.height * 1.6) / tiles;
    const engine = engineRef.current;
    const target = engine ? engine.cameraTarget() : { x: CENTRE.x, y: CENTRE.z };
    const goal = new THREE.Vector3(
      THREE.MathUtils.clamp(target.x, 7, MAP_WIDTH - 7),
      0,
      THREE.MathUtils.clamp(target.y, 5, MAP_HEIGHT - 5),
    );
    focus.current.lerp(goal, 1 - Math.exp(-4 * delta));
    ortho.position.copy(focus.current).addScaledVector(ISO_DIRECTION, 40);
    ortho.lookAt(focus.current);
    ortho.updateProjectionMatrix();
  });
  return null;
}

// ------------------------------------------------------------- avatars

/** Seat surface height per seat type, in world units. */
const SEAT_HEIGHT: Record<SeatType, number> = { chair: 0.45, stool: 0.75, sofa: 0.52, armchair: 0.4 };
/** Hip height when standing: the legs pivot here. */
const HIP = 0.42;
/** From hip to the top of the head. */
const HIP_TO_HEAD = 0.97;

function seatOf(a: AvatarRenderState) {
  return a.seated && a.seatId ? SEATS_BY_ID.get(a.seatId) : undefined;
}

/** Height of the hip above the floor: on the seat when sitting. */
function hipHeight(a: AvatarRenderState): number {
  const seat = seatOf(a);
  if (seat) return SEAT_HEIGHT[seat.seatType];
  return a.seated ? SEAT_HEIGHT.chair : HIP;
}

export function headTop(a: AvatarRenderState): number {
  return hipHeight(a) + HIP_TO_HEAD;
}

const presetOf = (id: string) => AVATAR_PRESETS.find((preset) => preset.id === id) ?? AVATAR_PRESETS[0];

function Avatar({ state }: { state: React.MutableRefObject<AvatarRenderState> }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const s = state.current;
  const colours = presetOf(s.presetId);

  useFrame(() => {
    const a = state.current;
    const g = root.current;
    if (!g || !body.current || !legL.current || !legR.current) return;
    g.position.set(a.x, 0, a.y);
    const seat = seatOf(a);
    // A sofa seat faces away from its backrest (+z), not towards the sofa
    // block the seat definition points at.
    g.rotation.y = seat?.seatType === 'sofa' ? 0 : yawOf(a.direction);
    const swing = a.moving && !a.reducedMotion ? Math.sin(a.phase * 11) * 0.5 : 0;
    const bob = a.moving && !a.reducedMotion ? Math.abs(Math.sin(a.phase * 11)) * 0.04 : 0;
    if (a.seated) {
      // Hip on the seat surface, thighs forward.
      body.current.position.y = hipHeight(a) - HIP;
      legL.current.rotation.x = -Math.PI / 2;
      legR.current.rotation.x = -Math.PI / 2;
    } else {
      body.current.position.y = bob;
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
    }
  });

  return (
    <group ref={root}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 10]} />
        <meshBasicMaterial color="#3a281c" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <mesh ref={legL} position={[-0.09, 0.42, 0]} geometry={LEG} material={mat(shadeHex(colours.top, -0.45))} castShadow />
        <mesh ref={legR} position={[0.09, 0.42, 0]} geometry={LEG} material={mat(shadeHex(colours.top, -0.45))} castShadow />
        <mesh position={[0, 0.72, 0]} castShadow material={mat(colours.top)}>
          <cylinderGeometry args={[0.17, 0.21, 0.55, 6]} />
        </mesh>
        <mesh position={[0, 1.12, 0]} castShadow material={mat(colours.skin)}>
          <icosahedronGeometry args={[0.17, 0]} />
        </mesh>
        <mesh position={[0, 1.2, -0.03]} castShadow material={mat(colours.hair)}>
          <icosahedronGeometry args={[0.165, 0]} />
        </mesh>
        <mesh position={[0, 0.98, 0.17]} material={mat(colours.accent)}>
          <boxGeometry args={[0.12, 0.04, 0.03]} />
        </mesh>
      </group>
    </group>
  );
}

// Pivot at the hip so legs swing and fold at the top.
const LEG = new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(0, -0.21, 0);

function shadeHex(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Reads the engine every frame and keeps one <Avatar> per entity. React only
 * re-renders when someone arrives or leaves; positions update in useFrame.
 */
function Avatars({
  engineRef,
  registry,
  onRoster,
}: {
  engineRef: Props['engineRef'];
  registry: PlateRegistry;
  onRoster: (ids: string[]) => void;
}) {
  const refs = useRef(registry.avatars);
  const [ids, setIds] = useState<string[]>([]);
  const force = () => {
    const next = [...refs.current.keys()];
    setIds(next);
    onRoster(next);
  };
  useFrame(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const seen = new Set<string>();
    let changed = false;
    for (const avatar of engine.sceneInput().avatars) {
      const id = avatar.id ?? avatar.displayName;
      seen.add(id);
      const existing = refs.current.get(id);
      if (existing) existing.current = avatar;
      else {
        refs.current.set(id, { current: avatar });
        changed = true;
      }
    }
    for (const id of refs.current.keys()) {
      if (!seen.has(id)) {
        refs.current.delete(id);
        changed = true;
      }
    }
    if (changed) force();
  });
  return (
    <>
      {ids.map((id) => {
        const ref = refs.current.get(id);
        return ref ? <Avatar key={id} state={ref as React.MutableRefObject<AvatarRenderState>} /> : null;
      })}
    </>
  );
}

/** Moves each HTML name plate to just above its avatar's head. */
function PlateProjector({ registry }: { registry: PlateRegistry }) {
  const { camera, size } = useThree();
  const point = new THREE.Vector3();
  useFrame(() => {
    for (const [id, element] of registry.elements) {
      const a = registry.avatars.get(id)?.current;
      if (!a) continue;
      point.set(a.x, headTop(a) + 0.14, a.y).project(camera);
      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      const inside = point.z < 1 && x > -80 && x < size.width + 80 && y > -40 && y < size.height + 40;
      element.style.visibility = inside ? 'visible' : 'hidden';
      element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      // Nearer avatars' plates sit on top of farther ones.
      element.style.zIndex = String(Math.round((a.x + a.y) * 10));
    }
  });
  return null;
}

// ---------------------------------------------------- seat highlight

function SeatHighlight({ engineRef }: { engineRef: Props['engineRef'] }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = ring.current;
    const id = engineRef.current?.nearbySeatId ?? null;
    const seat = id ? SEATS_BY_ID.get(id) : undefined;
    if (!mesh) return;
    mesh.visible = Boolean(seat);
    if (!seat) return;
    mesh.position.set(seat.x + 0.5, 0.03, seat.y + 0.5);
    const reduced = useCafeStore.getState().audio.reducedMotion;
    const pulse = reduced ? 0.6 : 0.45 + (Math.sin(clock.elapsedTime * 4) + 1) * 0.2;
    (mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.32, 0.44, 16]} />
      <meshBasicMaterial color="#c58b5a" transparent depthWrite={false} />
    </mesh>
  );
}

// ------------------------------------------------------ engine + input

function EngineDriver({
  engineRef,
  touchVectorRef,
  inputRef,
}: {
  engineRef: Props['engineRef'];
  touchVectorRef?: Props['touchVectorRef'];
  inputRef: ReturnType<typeof useKeyboardInput>;
}) {
  useFrame((_, delta) => {
    const engine = engineRef.current;
    if (!engine) return;
    const modalOpen = Boolean(document.querySelector('dialog[open]'));
    if (modalOpen) inputRef.current = { up: false, down: false, left: false, right: false, vector: null };
    engine.setInput({ ...inputRef.current, vector: modalOpen ? null : (touchVectorRef?.current ?? null) });
    engine.update(Math.min(delta, 0.1));
  });
  return null;
}

/** Pointer → floor point (world x/y), and world point → CSS px, for the DOM overlays. */
function Picker({
  engineRef,
  onSit,
  onStand,
  onOwnTableHover,
}: Pick<Props, 'engineRef' | 'onSit' | 'onStand' | 'onOwnTableHover'>) {
  const { camera, gl, size } = useThree();
  const hovering = useRef(false);

  useEffect(() => {
    const element = gl.domElement;
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();

    const worldAt = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(FLOOR, hit) ? { x: hit.x, y: hit.z } : null;
    };
    const toScreen = (x: number, y: number) => {
      const v = new THREE.Vector3(x, 0.8, y).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
    const ownTableAt = (clientX: number, clientY: number) => {
      const seatId = useCafeStore.getState().self?.seatId;
      const groupId = seatId ? SEATS_BY_ID.get(seatId)?.seatGroupId : undefined;
      if (!groupId) return null;
      const world = worldAt(clientX, clientY);
      if (!world || !onTable(groupId, world.x, world.y)) return null;
      const centre = tableCentre(groupId);
      return centre ? toScreen(centre.x, centre.y) : null;
    };

    const onMove = (event: PointerEvent) => {
      if (!onOwnTableHover || event.pointerType === 'touch') return;
      const anchor = ownTableAt(event.clientX, event.clientY);
      if (Boolean(anchor) === hovering.current) return;
      hovering.current = Boolean(anchor);
      onOwnTableHover(anchor);
    };
    const onLeave = () => {
      if (!hovering.current) return;
      hovering.current = false;
      onOwnTableHover?.(null);
    };
    const onClick = (event: MouseEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const tableAnchor = ownTableAt(event.clientX, event.clientY);
      if (tableAnchor && onOwnTableHover) {
        onOwnTableHover(tableAnchor);
        return;
      }
      const world = worldAt(event.clientX, event.clientY);
      if (!world) return;
      const seat = engine.seatAtWorld(world.x, world.y);
      if (!seat) return;
      if (engine.isSeated() && engine.nearbySeatId === null) {
        onStand();
        return;
      }
      if (useCafeStore.getState().seatOwners[seat.seatId]) {
        useCafeStore.getState().showToast('Đã có người ngồi ở đó rồi.', 'info');
        return;
      }
      onSit(seat.seatId);
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('click', onClick);
    };
  }, [camera, gl, size, engineRef, onSit, onStand, onOwnTableHover]);
  return null;
}

/** Steps the scene down to the low tier once if the frame rate stays low. */
function FrameRateGuard({ tier, onLow }: { tier: QualityTier; onLow: () => void }) {
  const window = useRef({ time: 0, frames: 0 });
  useFrame((_, delta) => {
    if (tier === 'low') return;
    const w = window.current;
    w.time += delta;
    w.frames += 1;
    if (w.time < FPS_WINDOW) return;
    const fps = w.frames / w.time;
    w.time = 0;
    w.frames = 0;
    if (fps < MIN_FPS) onLow();
  });
  return null;
}

// ----------------------------------------------------------------- root

/**
 * The café in 3D (stylised low-poly, isometric orthographic camera).
 *
 * Phase 1 of the move to React Three Fiber: room, furniture, avatars, seat
 * highlight, click-to-sit and own-table hover. Gameplay is untouched — the
 * same CafeEngine drives it; this only replaces how the room is drawn.
 * Time of day, lamps, the live-weather window and rain: see Atmosphere.
 */
export default function CafeScene3D({ engineRef, touchVectorRef, onSit, onStand, onInteract, onOwnTableHover }: Props) {
  const inputRef = useKeyboardInput(onInteract);
  const registry = useRef<PlateRegistry>({ avatars: new Map<string, AvatarRef>(), elements: new Map() }).current;
  const [roster, setRoster] = useState<string[]>([]);
  const onRoster = useCallback((ids: string[]) => setRoster(ids), []);
  const [tier, setTier] = useState<QualityTier>(() => initialTier());
  const quality = QUALITY[tier];
  const stepDown = useCallback(() => setTier('low'), []);
  return (
    <div
      className="absolute inset-0 touch-none"
      role="application"
      tabIndex={0}
      aria-label="Sàn quán cà phê. Dùng phím W, A, S, D hoặc các phím mũi tên để đi, và nhấn E để ngồi xuống."
    >
      <Canvas
        orthographic
        shadows={quality.shadows}
        dpr={quality.dpr}
        camera={{ zoom: 50, near: 0.1, far: 200, position: [40, 33, 40] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#2b211c');
          scene.fog = null;
        }}
        style={{ cursor: 'pointer' }}
      >
        <IsoCamera engineRef={engineRef} />
        <Atmosphere quality={quality} />
        <FrameRateGuard tier={tier} onLow={stepDown} />
        <Room />
        <Avatars engineRef={engineRef} registry={registry} onRoster={onRoster} />
        <PlateProjector registry={registry} />
        <SeatHighlight engineRef={engineRef} />
        <EngineDriver engineRef={engineRef} touchVectorRef={touchVectorRef} inputRef={inputRef} />
        <Picker engineRef={engineRef} onSit={onSit} onStand={onStand} onOwnTableHover={onOwnTableHover} />
      </Canvas>
      <NamePlates roster={roster} registry={registry} />
    </div>
  );
}
