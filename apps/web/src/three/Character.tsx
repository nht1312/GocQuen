'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarRenderState } from '@/game/avatar';

/**
 * Kenney "Mini Characters" (CC0) in /public/models/characters. Rigged, with
 * idle / walk / sit clips — the clip follows what the engine says the avatar
 * is doing. Each preset maps to one character so everyone keeps the look
 * they picked; the barista NPC wears the worker outfit.
 */
const BASE = '/models/characters/';

const BY_PRESET: Record<string, string> = {
  clay: 'character-male-a',
  olive: 'character-male-b',
  rose: 'character-female-a',
  slate: 'character-male-c',
  cream: 'character-female-b',
  cocoa: 'character-female-c',
  sage: 'character-female-d',
};

export function characterFor(a: AvatarRenderState): string {
  if (a.isNpc && a.id === 'npc_barista') return 'character-worker';
  return BY_PRESET[a.presetId] ?? 'character-male-a';
}

/**
 * The model is 0.67 tall with its hips at 0.176; scaled so a character
 * stands ~0.77 — a little taller than a table (0.74), smaller than a chair
 * is wide. Measured from character-male-a.glb.
 */
export const SCALE = 1.15;
const MODEL_HEIGHT = 0.67;
const MODEL_HIP = 0.176;
/** The `sit` clip drops the root by 0.15, so the hips end up at 0.026. */
const MODEL_SIT_DROP = 0.15;

/** Height of the hips above the character's origin while sitting, scaled. */
export const SIT_HIP = (MODEL_HIP - MODEL_SIT_DROP) * SCALE;
/** Standing height, scaled. */
export const STAND_HEAD = MODEL_HEIGHT * SCALE;
/** Hips to top of head, scaled. */
export const HIP_TO_HEAD_MODEL = (MODEL_HEIGHT - MODEL_HIP) * SCALE;

function useWarmCharacter(name: string) {
  const gltf = useGLTF(`${BASE}${name}.glb`);
  const scene = useMemo(() => {
    const copy = cloneSkinned(gltf.scene);
    copy.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const material = (mesh.material as THREE.MeshStandardMaterial).clone();
      // Same warm, matte look as the furniture.
      material.roughness = 0.85;
      material.metalness = 0;
      material.color.set('#fff2e4');
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.magFilter = THREE.NearestFilter;
      }
      mesh.material = material;
    });
    return copy;
  }, [gltf.scene]);
  return { scene, animations: gltf.animations };
}

function Rigged({ state, name }: { state: React.MutableRefObject<AvatarRenderState>; name: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useWarmCharacter(name);
  const { actions } = useAnimations(animations, group);
  const current = useRef<string>('');

  useEffect(
    () => () => {
      for (const action of Object.values(actions)) action?.stop();
    },
    [actions],
  );

  useFrame(() => {
    const a = state.current;
    const want = a.seated ? 'sit' : a.moving && !a.reducedMotion ? 'walk' : 'idle';
    if (want === current.current) return;
    const next = actions[want] ?? actions.idle;
    const previous = current.current ? actions[current.current] : null;
    next?.reset().fadeIn(a.reducedMotion ? 0 : 0.2).play();
    previous?.fadeOut(a.reducedMotion ? 0 : 0.2);
    current.current = want;
  });

  return (
    <group ref={group} scale={SCALE}>
      <primitive object={scene} />
    </group>
  );
}

/** The character model, or `fallback` (the built-in figure) while it loads. */
export function CharacterModel({
  state,
  fallback,
}: {
  state: React.MutableRefObject<AvatarRenderState>;
  fallback: React.ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <Rigged state={state} name={characterFor(state.current)} />
    </Suspense>
  );
}

export function preloadCharacters(): void {
  for (const name of new Set([...Object.values(BY_PRESET), 'character-worker'])) useGLTF.preload(`${BASE}${name}.glb`);
}
