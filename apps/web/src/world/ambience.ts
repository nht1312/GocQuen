'use client';

/**
 * Real-world time and weather, so the café outside the window matches the
 * street outside yours.
 *
 * Weather comes from Open-Meteo (https://open-meteo.com): free, no API key,
 * CORS-enabled, so the browser calls it directly and no secret is involved.
 * The location is fixed by configuration, never the visitor's GPS — asking a
 * guest for their position just to draw rain would be a poor trade.
 *
 * Every failure degrades to "clear, local clock time": the café never waits on
 * the network and never breaks because a weather service is down.
 */

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm';

export interface WorldAmbience {
  /** 0 = full night, 1 = full day. Smooth through dawn and dusk. */
  daylight: number;
  phase: SkyPhase;
  weather: WeatherKind;
  /** 0..1 — how heavy the rain is (0 when it is not raining). */
  rain: number;
  /** Café lamps are on: 18:00 → 06:00 on the café's own clock. */
  lightsOn: boolean;
  /** 0..1 cloud cover. */
  cloud: number;
  temperatureC: number | null;
  /** True once real data has arrived; false while on the clock-only fallback. */
  live: boolean;
  locationLabel: string;
}

const LAT = Number(process.env.NEXT_PUBLIC_WEATHER_LAT ?? 10.7769);
const LON = Number(process.env.NEXT_PUBLIC_WEATHER_LON ?? 106.7009);
const LOCATION_LABEL = process.env.NEXT_PUBLIC_WEATHER_LABEL ?? 'TP. Hồ Chí Minh';
const DISABLED = process.env.NEXT_PUBLIC_LIVE_WEATHER === '0';

const REFRESH_MS = 15 * 60 * 1000;
/** Opening hours of the lamps, minutes since midnight (café local time). */
export const LIGHTS_ON_AT = 18 * 60;
export const LIGHTS_OFF_AT = 6 * 60;

export function lightsOnAt(minutes: number): boolean {
  return minutes >= LIGHTS_ON_AT || minutes < LIGHTS_OFF_AT;
}
const TWILIGHT_MINUTES = 45;

/** Open-Meteo WMO weather codes → what we can draw. */
export function weatherFromCode(code: number): WeatherKind {
  if (code >= 95) return 'storm';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloudy';
  return 'clear';
}

const smooth = (value: number) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};

/**
 * Daylight from the clock and the day's sunrise/sunset (minutes since
 * midnight). Ramps over a twilight band either side of each.
 */
export function daylightAt(
  minutes: number,
  sunrise = 6 * 60,
  sunset = 18 * 60,
): { daylight: number; phase: SkyPhase } {
  const rise = smooth((minutes - (sunrise - TWILIGHT_MINUTES)) / (TWILIGHT_MINUTES * 2));
  const set = 1 - smooth((minutes - (sunset - TWILIGHT_MINUTES)) / (TWILIGHT_MINUTES * 2));
  const daylight = Math.min(rise, set);
  let phase: SkyPhase = 'night';
  if (Math.abs(minutes - sunrise) <= TWILIGHT_MINUTES) phase = 'dawn';
  else if (Math.abs(minutes - sunset) <= TWILIGHT_MINUTES) phase = 'dusk';
  else if (daylight > 0.5) phase = 'day';
  return { daylight, phase };
}

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function minutesOfIso(iso: string | undefined): number | undefined {
  // Open-Meteo returns local wall time like "2026-11-07T05:48" for timezone=auto.
  const match = iso?.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

interface Snapshot {
  weather: WeatherKind;
  rain: number;
  cloud: number;
  temperatureC: number | null;
  sunrise?: number;
  sunset?: number;
  /** Minutes the location's clock is ahead of the browser's. */
  clockOffset: number;
}

let snapshot: Snapshot | null = null;

async function fetchSnapshot(): Promise<Snapshot | null> {
  if (DISABLED || !Number.isFinite(LAT) || !Number.isFinite(LON)) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,weather_code,cloud_cover,precipitation' +
    '&daily=sunrise,sunset&forecast_days=1&timezone=auto';
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      utc_offset_seconds?: number;
      current?: { temperature_2m?: number; weather_code?: number; cloud_cover?: number; precipitation?: number };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const code = data.current?.weather_code ?? 0;
    const weather = weatherFromCode(code);
    const precipitation = data.current?.precipitation ?? 0;
    const wet = weather === 'rain' || weather === 'storm' || weather === 'drizzle';
    // The café's sky follows the *location's* clock, not the visitor's.
    const browserOffset = -new Date().getTimezoneOffset();
    const locationOffset = (data.utc_offset_seconds ?? browserOffset * 60) / 60;
    return {
      weather,
      rain: wet ? Math.max(weather === 'drizzle' ? 0.25 : 0.5, Math.min(1, precipitation / 4)) : 0,
      cloud: Math.max(0, Math.min(1, (data.current?.cloud_cover ?? 0) / 100)),
      temperatureC: data.current?.temperature_2m ?? null,
      sunrise: minutesOfIso(data.daily?.sunrise?.[0]),
      sunset: minutesOfIso(data.daily?.sunset?.[0]),
      clockOffset: locationOffset - browserOffset,
    };
  } catch {
    return null;
  }
}

/** Current ambience from the last snapshot (or the clock alone). */
export function currentAmbience(now = new Date()): WorldAmbience {
  const offset = snapshot?.clockOffset ?? 0;
  const minutes = (((minutesOf(now) + offset) % 1440) + 1440) % 1440;
  const { daylight, phase } = daylightAt(minutes, snapshot?.sunrise, snapshot?.sunset);
  return {
    daylight,
    phase,
    lightsOn: lightsOnAt(minutes),
    weather: snapshot?.weather ?? 'clear',
    rain: snapshot?.rain ?? 0,
    cloud: snapshot?.cloud ?? 0,
    temperatureC: snapshot?.temperatureC ?? null,
    live: snapshot !== null,
    locationLabel: LOCATION_LABEL,
  };
}

/**
 * Poll the weather and tick the clock. Calls `onChange` immediately with the
 * clock-only state, again when data arrives, then every minute.
 */
export function startAmbience(onChange: (ambience: WorldAmbience) => void): () => void {
  let stopped = false;
  const emit = () => {
    if (!stopped) onChange(currentAmbience());
  };
  const refresh = async () => {
    const next = await fetchSnapshot();
    if (next) snapshot = next;
    emit();
  };
  emit();
  void refresh();
  const weatherTimer = window.setInterval(() => void refresh(), REFRESH_MS);
  const clockTimer = window.setInterval(emit, 60 * 1000);
  return () => {
    stopped = true;
    window.clearInterval(weatherTimer);
    window.clearInterval(clockTimer);
  };
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'trời quang',
  cloudy: 'nhiều mây',
  fog: 'sương mù',
  drizzle: 'mưa phùn',
  rain: 'đang mưa',
  storm: 'có giông',
};

export const PHASE_LABELS: Record<SkyPhase, string> = {
  dawn: 'bình minh',
  day: 'ban ngày',
  dusk: 'hoàng hôn',
  night: 'ban đêm',
};
