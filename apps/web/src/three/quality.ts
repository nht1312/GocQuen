'use client';

/**
 * How much the 3D café asks of the device.
 *
 *  high — laptops/desktops: dpr up to 2, soft shadows, every lamp a real light.
 *  low  — phones, small or touch-only screens, low memory, or a device that
 *         could not hold ~30 fps: dpr ≤ 1.25, no shadows, lamps glow but
 *         only a few cast real light, less rain.
 *
 * Starts from a guess at mount and steps down once (never back up) if the
 * frame rate stays low, so a weak laptop is not stuck stuttering either.
 */
export type QualityTier = 'high' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  /** Lamps that get a real point light; the rest only glow. */
  maxLampLights: number;
  rainDrops: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { tier: 'high', dpr: [1, 2], shadows: true, shadowMapSize: 2048, maxLampLights: 16, rainDrops: 220 },
  low: { tier: 'low', dpr: [1, 1.25], shadows: false, shadowMapSize: 512, maxLampLights: 4, rainDrops: 90 },
};

export function initialTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (coarse || small || (memory !== undefined && memory <= 4) || cores <= 4) return 'low';
  return 'high';
}

/** True when the browser can create a WebGL context at all. */
export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Frames per second below which the scene steps down to `low`. */
export const MIN_FPS = 30;
/** Seconds of sustained low frame rate before stepping down. */
export const FPS_WINDOW = 3;
