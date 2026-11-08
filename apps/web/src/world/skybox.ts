'use client';

import type { WorldAmbience } from './ambience';

/**
 * The sky seen through the café window, from the panoramas in
 * /public/skyboxes. Chosen by the café's clock (morning at dawn and dusk,
 * day, night) and crossfaded when it changes. Live weather — cloud, rain,
 * haze, lightning — is still painted on top by each renderer.
 *
 * `NEXT_PUBLIC_SKYBOX_THEME=space|alien` pins a themed sky instead.
 */
export type SkyName = 'morning' | 'day' | 'night' | 'space' | 'alien';

const SRC: Record<SkyName, string> = {
  morning: '/skyboxes/skybox-morning.png',
  day: '/skyboxes/skybox-day.png',
  night: '/skyboxes/skybox-night.png',
  space: '/skyboxes/skybox-space.png',
  alien: '/skyboxes/skybox-alien.png',
};

const THEME = process.env.NEXT_PUBLIC_SKYBOX_THEME;
const FIXED: SkyName | null = THEME === 'space' || THEME === 'alien' ? THEME : null;

/** The panorama that follows, so it is already downloaded when needed. */
const NEXT: Record<SkyName, SkyName> = { morning: 'day', day: 'morning', night: 'morning', space: 'space', alien: 'alien' };

export const SKY_FADE_MS = 4000;

export function skyNameFor(ambience: WorldAmbience | null | undefined): SkyName {
  if (FIXED) return FIXED;
  if (!ambience) return 'day';
  if (ambience.phase === 'dawn' || ambience.phase === 'dusk') return 'morning';
  return ambience.phase === 'night' ? 'night' : 'day';
}

const cache = new Map<SkyName, HTMLImageElement>();

/** The decoded image, or null while it is still downloading. */
export function skyImage(name: SkyName): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let image = cache.get(name);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = SRC[name];
    cache.set(name, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

export interface SkyLayers {
  below: HTMLImageElement | null;
  above: HTMLImageElement | null;
  /** 0..1 opacity of `above` over `below`. */
  t: number;
  belowName: SkyName | null;
  aboveName: SkyName | null;
}

/** Tracks which panorama is showing and crossfades to the next once loaded. */
export class SkyFader {
  private above: SkyName | null = null;
  private below: SkyName | null = null;
  private since = 0;

  update(target: SkyName, now: number, instant: boolean): SkyLayers {
    if (target !== this.above && skyImage(target)) {
      this.below = this.above;
      this.above = target;
      this.since = now;
    }
    skyImage(NEXT[target]);
    const t = instant || !this.below ? 1 : Math.min(1, (now - this.since) / SKY_FADE_MS);
    if (t >= 1) this.below = null;
    return {
      below: this.below ? skyImage(this.below) : null,
      above: this.above ? skyImage(this.above) : null,
      t,
      belowName: this.below,
      aboveName: this.above,
    };
  }
}

/**
 * Draw the horizon band of an equirectangular panorama into a wide window
 * rectangle: mostly sky, with the horizon near the bottom.
 */
export function drawSkyCrop(
  g: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const aspect = dw / dh;
  let sw = iw * 0.75;
  let sh = sw / aspect;
  if (sh > ih * 0.6) {
    sh = ih * 0.6;
    sw = sh * aspect;
  }
  const sx = (iw - sw) / 2;
  const sy = Math.max(0, Math.min(ih - sh, ih * 0.5 - sh * 0.85));
  g.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** Paint the sky layers, then the live weather's overcast over them. */
export function paintSkyLayers(
  g: CanvasRenderingContext2D,
  layers: SkyLayers,
  x: number,
  y: number,
  w: number,
  h: number,
  weather: { cloud: number; rain: number; night: number },
): boolean {
  if (!layers.above) return false;
  if (layers.below) drawSkyCrop(g, layers.below, x, y, w, h);
  g.globalAlpha = layers.t;
  drawSkyCrop(g, layers.above, x, y, w, h);
  g.globalAlpha = 1;
  // Grey it down under cloud and rain, so the panorama still reads the weather.
  const overcast = Math.min(0.75, weather.cloud * 0.45 + weather.rain * 0.2);
  if (overcast > 0.01) {
    g.fillStyle = weather.night > 0.5 ? `rgba(40, 46, 62, ${overcast})` : `rgba(150, 158, 166, ${overcast})`;
    g.fillRect(x, y, w, h);
  }
  return true;
}
