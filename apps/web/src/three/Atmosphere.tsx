'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAP_HEIGHT, MAP_OBJECTS, MAP_WIDTH } from '@virtual-cafe/shared';
import { hash2 } from '@/game/palette';
import { useCafeStore } from '@/state/useCafeStore';
import type { WorldAmbience } from '@/world/ambience';
import { mat } from './materials';
import { WINDOW_BOX } from './Room';
import type { QualitySettings } from './quality';

/**
 * Phase 3 of the 3D café: real time and weather (world/ambience.ts).
 *
 *  - Sun and sky light follow the café's clock; amber at dawn and dusk.
 *  - 18:00 → 06:00 the lamps switch on: a soft point light under each
 *    pendant, a warm bulb and a small halo — kept low so nothing glares.
 *  - The street behind the 4-pane window is painted from the live weather:
 *    sky, sun or moon, stars, clouds, lit buildings, wet road, haze.
 *  - Rain falls behind the glass and lightning flashes in a storm.
 *  - "Giảm chuyển động" stops rain and lightning and switches lamps instantly.
 */

interface Sky {
  daylight: number;
  rain: number;
  cloud: number;
  storm: boolean;
  lightsOn: boolean;
}

/** Same fallback as the 2D renderer: rainy afternoon, clock still sets day/night. */
function skyOf(a: WorldAmbience | null): Sky {
  if (!a) return { daylight: 1, rain: 1, cloud: 0.6, storm: false, lightsOn: false };
  if (!a.live) return { daylight: a.daylight, rain: 1, cloud: 0.6, storm: false, lightsOn: a.lightsOn };
  return { daylight: a.daylight, rain: a.rain, cloud: a.cloud, storm: a.weather === 'storm', lightsOn: a.lightsOn };
}

function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const CENTRE = new THREE.Vector3(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
const LAMPS = MAP_OBJECTS.filter((o) => o.kind === 'hanging_lamp' || o.kind === 'floor_lamp').map((o) => ({
  id: o.id,
  x: o.x + o.w / 2,
  z: o.y + o.h / 2,
  y: o.kind === 'hanging_lamp' ? 2.15 : 1.6,
}));

// --------------------------------------------------------- street view

function paintStreet(g: CanvasRenderingContext2D, w: number, h: number, sky: Sky): void {
  const night = 1 - sky.daylight;
  const grey = sky.cloud * 0.6;
  const twilight = Math.max(0, 1 - Math.abs(sky.daylight - 0.5) * 2.4);
  const ground = h * 0.84;

  const top = mix(mix(mix('#7fb2d9', '#9aa6b0', grey), '#e59a6a', twilight * 0.6), '#0f1630', night);
  const low = mix(mix(mix('#cfe3ee', '#c2c8cc', grey), '#f3c48e', twilight * 0.7), '#26304a', night);
  const gradient = g.createLinearGradient(0, 0, 0, ground);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, low);
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);

  if (sky.cloud < 0.85) {
    g.globalAlpha = Math.max(0, Math.min(1, 1 - Math.max(0, sky.cloud - 0.4) / 0.45));
    g.fillStyle = night > 0.5 ? '#eef1f7' : '#fff1c4';
    g.beginPath();
    g.arc(w * 0.8, h * 0.2, night > 0.5 ? 9 : 12, 0, Math.PI * 2);
    g.fill();
    if (night > 0.5) {
      g.fillStyle = top;
      g.beginPath();
      g.arc(w * 0.8 + 4, h * 0.2 - 2, 8, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  if (night > 0.6 && sky.cloud < 0.5) {
    g.fillStyle = `rgba(255,255,255,${0.7 * night * (1 - sky.cloud * 2)})`;
    for (let i = 0; i < 40; i += 1) g.fillRect(hash2(i, 1) * w, hash2(i, 2) * h * 0.45, 1.5, 1.5);
  }

  g.fillStyle = mix(mix('#ffffff', '#8e979e', grey + sky.rain * 0.3), '#3a4256', night);
  g.globalAlpha = 0.55 + sky.cloud * 0.4;
  const clouds = Math.round(2 + sky.cloud * 8);
  for (let i = 0; i < clouds; i += 1) {
    const cx = hash2(i, 4) * w;
    const cy = h * (0.12 + hash2(i, 5) * 0.25);
    for (let j = -1; j <= 1; j += 1) {
      g.beginPath();
      g.ellipse(cx + j * 16, cy - (j === 0 ? 5 : 0), 20, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  const lit = Math.max(0, (night - 0.25) / 0.75);
  let x = 0;
  for (let n = 0; x < w; n += 1) {
    const bw = 36 + hash2(n, 11) * 54;
    const bh = h * (0.22 + hash2(n, 12) * 0.32);
    g.fillStyle = mix(mix(n % 2 ? '#9aa7a6' : '#7d8a86', '#80888a', grey), n % 2 ? '#1a2032' : '#141a28', night);
    g.fillRect(x, ground - bh, bw, bh);
    if (lit > 0) {
      g.fillStyle = `rgba(255,205,130,${0.85 * lit})`;
      for (let row = 0; row < 5; row += 1)
        for (let col = 0; col < 3; col += 1) {
          if (hash2(n * 7 + row, col * 3) > 0.5) continue;
          const wy = ground - bh + 8 + row * 12;
          if (wy > ground - 10) continue;
          g.fillRect(x + 7 + col * (bw / 3), wy, 5, 6);
        }
    }
    x += bw + 3;
  }

  g.fillStyle = mix(mix('#6f8a5c', '#66735e', grey), '#141c18', night);
  for (let i = 0; i < 12; i += 1) {
    g.beginPath();
    g.ellipse((i + 0.4 + hash2(i, 21) * 0.3) * (w / 12), ground - 10, 14, 16, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = mix(mix('#8d8a84', '#5f646a', sky.rain), '#1b1f28', night);
  g.fillRect(0, ground, w, h - ground);

  if (night > 0.3) {
    for (let i = 0; i < 5; i += 1) {
      const lx = (i + 0.5) * (w / 5);
      const glow = g.createRadialGradient(lx, ground + 4, 0, lx, ground + 4, 34);
      glow.addColorStop(0, `rgba(255,200,120,${0.45 * night})`);
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = glow;
      g.fillRect(lx - 34, ground - 30, 68, 64);
    }
  }

  const haze = Math.max(sky.cloud > 0.9 && sky.rain === 0 ? 0.15 : 0, sky.rain * 0.25);
  if (haze > 0) {
    g.fillStyle = `rgba(200,210,216,${haze * (1 - night * 0.6)})`;
    g.fillRect(0, 0, w, h);
  }
}

function StreetView() {
  const { from, to, sill, head, wallZ } = WINDOW_BOX;
  const { canvas, texture } = useMemo(() => {
    const element = document.createElement('canvas');
    element.width = 1024;
    element.height = 160;
    const map = new THREE.CanvasTexture(element);
    map.colorSpace = THREE.SRGBColorSpace;
    return { canvas: element, texture: map };
  }, []);

  useEffect(() => {
    let key = '';
    const draw = (ambience: WorldAmbience | null) => {
      const sky = skyOf(ambience);
      const next = `${sky.daylight.toFixed(2)}|${sky.rain.toFixed(2)}|${sky.cloud.toFixed(2)}`;
      if (next === key) return;
      key = next;
      paintStreet(canvas.getContext('2d')!, canvas.width, canvas.height, sky);
      texture.needsUpdate = true;
    };
    draw(useCafeStore.getState().ambience);
    return useCafeStore.subscribe((state) => draw(state.ambience));
  }, [canvas, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[(from + to) / 2, (sill + head) / 2, wallZ - 0.3]}>
      <planeGeometry args={[to - from, head - sill]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------- rain

const DROPS = 220;

function Rain({ maxDrops }: { maxDrops: number }) {
  const { from, to, sill, head, wallZ, thickness } = WINDOW_BOX;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3));
    return g;
  }, []);
  const lines = useRef<THREE.LineSegments>(null);

  useFrame(({ clock }) => {
    const state = useCafeStore.getState();
    const sky = skyOf(state.ambience);
    const segments = lines.current;
    if (!segments) return;
    const visible = !state.audio.reducedMotion && sky.rain > 0;
    segments.visible = visible;
    if (!visible) return;
    const count = Math.round(Math.min(DROPS, maxDrops) * (0.25 + sky.rain * 0.75));
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    const span = head - sill + 0.3;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i += 1) {
      const seed = hash2(i, 31);
      const x = from + hash2(i, 32) * (to - from);
      const y = head - ((t * (2.6 + seed * 1.2) + seed * 4) % span);
      const z = wallZ - 0.25 + hash2(i, 33) * (thickness + 0.2);
      const o = i * 6;
      array[o] = x;
      array[o + 1] = y;
      array[o + 2] = z;
      array[o + 3] = x - 0.02;
      array[o + 4] = y - 0.12;
      array[o + 5] = z;
    }
    geometry.setDrawRange(0, count * 2);
    position.needsUpdate = true;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments ref={lines} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#e1ebf5" transparent opacity={0.55} depthWrite={false} />
    </lineSegments>
  );
}

// ----------------------------------------------------- lights and lamps

function useGlowTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,228,180,1)');
    gradient.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

export function Atmosphere({ quality }: { quality: QualitySettings }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const flash = useRef<THREE.Mesh>(null);
  const points = useRef<Array<THREE.PointLight | null>>([]);
  const halos = useRef<Array<THREE.Sprite | null>>([]);
  const level = useRef(0);
  const glow = useGlowTexture();
  const { from, to, sill, head, wallZ } = WINDOW_BOX;

  // The same cached materials Room.tsx gives the bulbs and the floor-lamp shade.
  const bulb = useMemo(() => mat('#f2d6a6', { emissive: '#f2d6a6', emissiveIntensity: 0.5 }), []);
  const shadeMat = useMemo(() => mat('#e8c893', { emissive: '#e8c893', emissiveIntensity: 0.25 }), []);

  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.copy(CENTRE);
    light.target.updateMatrixWorld();
  }, []);

  useFrame(({ clock }, delta) => {
    const state = useCafeStore.getState();
    const sky = skyOf(state.ambience);
    const reduced = state.audio.reducedMotion;
    const target = sky.lightsOn ? 1 : 0;
    level.current += (target - level.current) * (reduced ? 1 : Math.min(1, delta * 1.5));
    const lamps = level.current;
    const night = 1 - sky.daylight;
    const twilight = Math.max(0, 1 - Math.abs(sky.daylight - 0.5) * 2.4);
    const storm = sky.storm && !reduced && (clock.elapsedTime * 1000) % 11000 < 140;

    if (hemi.current) {
      // The room never goes dark: after sunset the fill light stays bright
      // and turns warm amber, so the café reads as cosy rather than night-blue.
      hemi.current.intensity = 1.0 + 0.9 * night + (storm ? 0.8 : 0);
      hemi.current.color.set(mix('#fff1dc', '#ffc890', night));
      hemi.current.groundColor.set(mix('#6b4f3a', '#7a4a2a', night));
    }
    if (sun.current) {
      // By day this is the sun; after dark it becomes the café's own warm
      // ceiling light, so the room stays bright and amber at night.
      const daySun = 1.6 * sky.daylight * (1 - sky.cloud * 0.5);
      const roomLight = 1.3 * night;
      sun.current.intensity = Math.max(daySun, roomLight);
      sun.current.color.set(
        daySun >= roomLight ? mix('#ffe2b8', '#ff9a5a', twilight * 0.7) : '#ffcf9a',
      );
      sun.current.castShadow = quality.shadows && sun.current.intensity > 0.15;
    }
    points.current.forEach((light) => {
      if (!light) return;
      // Lamps are accents over the seats, not the room's main light.
      light.intensity = 2.2 * lamps;
      light.visible = lamps > 0.01;
    });
    halos.current.forEach((sprite) => {
      if (!sprite) return;
      (sprite.material as THREE.SpriteMaterial).opacity = 0.3 * lamps;
      sprite.visible = lamps > 0.01;
    });
    bulb.emissiveIntensity = 0.3 + 1.4 * lamps;
    shadeMat.emissiveIntensity = 0.15 + 0.8 * lamps;
    if (flash.current) {
      (flash.current.material as THREE.MeshBasicMaterial).opacity = storm ? 0.6 : 0;
      flash.current.visible = storm;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff1dc', '#6b4f3a', 0.9]} />
      <directionalLight
        ref={sun}
        position={[CENTRE.x + 6, 14, CENTRE.z - 10]}
        intensity={1.6}
        color="#ffe2b8"
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0005}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {LAMPS.map((lamp, i) => (
        <group key={lamp.id}>
          {/* On a low tier only the first few lamps are real lights; every
              lamp still glows, so the room reads the same at a glance. */}
          {i < quality.maxLampLights ? (
          <pointLight
            ref={(light) => {
              points.current[i] = light;
            }}
            position={[lamp.x, lamp.y - 0.1, lamp.z]}
            color="#ffc98a"
            intensity={0}
            distance={3}
            decay={2}
            visible={false}
          />
          ) : null}
          <sprite
            ref={(sprite) => {
              halos.current[i] = sprite;
            }}
            position={[lamp.x, lamp.y, lamp.z]}
            scale={[0.55, 0.55, 0.55]}
            visible={false}
          >
            <spriteMaterial map={glow} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
      <StreetView />
      <Rain maxDrops={quality.rainDrops} />
      <mesh ref={flash} position={[(from + to) / 2, (sill + head) / 2, wallZ - 0.1]} visible={false}>
        <planeGeometry args={[to - from, head - sill]} />
        <meshBasicMaterial color="#ebf0ff" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}
