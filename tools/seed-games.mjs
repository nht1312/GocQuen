/**
 * Upload the games in /games (games.json + banners + roms) into the
 * database, through the API server's PUT /games/:id.
 *
 *   GAMES_ADMIN_TOKEN=... SERVER_URL=http://localhost:4000 npm run seed:games
 *
 * Re-running replaces each game in place, so it is safe to run on every
 * change to a banner or a ROM.
 */
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'games');
const server = (process.env.SERVER_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const token = process.env.GAMES_ADMIN_TOKEN;
if (!token) {
  console.error('GAMES_ADMIN_TOKEN is not set (it must match the server).');
  process.exit(1);
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const { games } = JSON.parse(await readFile(join(root, 'games.json'), 'utf8'));

let failed = 0;
for (const game of games) {
  try {
    const [banner, rom] = await Promise.all([readFile(join(root, game.banner)), readFile(join(root, game.rom))]);
    const contentType = TYPES[extname(game.banner).toLowerCase()];
    if (!contentType) throw new Error(`unsupported banner type: ${game.banner}`);
    const response = await fetch(`${server}/games/${encodeURIComponent(game.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({
        title: game.title,
        hint: game.hint ?? '',
        sortOrder: game.sortOrder ?? 0,
        banner: { contentType, base64: banner.toString('base64') },
        rom: { base64: rom.toString('base64') },
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    console.log(`✓ ${game.id} (${(rom.length / 1024).toFixed(0)} KB rom, ${(banner.length / 1024).toFixed(0)} KB banner)`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${game.id}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
