/**
 * Loads the monorepo-root `.env` into `process.env`.
 *
 * This module must be imported before anything that reads `process.env`
 * (see main.ts) because `AppConfig` resolves its fields eagerly.
 *
 * Why the upward walk: the server is started from different working
 * directories — `nest start --watch` runs with cwd `apps/server`, the npm
 * workspace scripts run from the repo root — so a bare relative path to
 * `.env` resolves inconsistently. Walking up from this file's own location
 * finds the same `.env` in every case.
 *
 * Real environment variables always win over the file, so a value exported in
 * the shell or injected by a host platform is never clobbered by a stale local
 * `.env`.
 */
import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export function loadEnv(startDir: string = __dirname): string | null {
  if (typeof process.loadEnvFile !== 'function') {
    // Node < 20.12. The café still runs; it just relies on real env vars.
    return null;
  }

  const { root } = parse(startDir);
  let dir = startDir;

  while (true) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const before = { ...process.env };
      try {
        process.loadEnvFile(candidate);
      } catch {
        return null; // Unreadable or malformed; fall back to real env vars.
      }
      // Restore anything that was already set in the real environment.
      for (const [key, value] of Object.entries(before)) {
        if (value !== undefined) process.env[key] = value;
      }
      return candidate;
    }
    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export const loadedEnvFile = loadEnv();
