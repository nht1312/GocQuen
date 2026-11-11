import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { GameRecord, Store } from '../storage/store';

interface CatalogEntry {
  id: string;
  title: string;
  hint?: string;
  credit?: string;
  sortOrder?: number;
  banner: string;
  rom: string;
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
/** Every iNES / NES 2.0 file starts with these four bytes. */
const NES_MAGIC = Buffer.from([0x4e, 0x45, 0x53, 0x1a]);
const MAX_ROM = 4 * 1024 * 1024;
const ID = /^[a-z0-9-]{1,40}$/;

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/**
 * Khu Chơi Game storage flow:
 *
 *   games/ in git  ──(server boot)──▶  `games` table  ──▶  GET /games/…
 *   (source of truth)    sync by hash        (serving)        (immutable URLs)
 *
 * On every boot the table is made to match games/games.json:
 *   - a new or changed game (sha256 of its files, or its text) is written,
 *   - an unchanged one is left alone, so a deploy does not rewrite the blobs,
 *   - a game no longer in the catalog is deleted.
 * If the catalog is missing the table is left as it is.
 */
@Injectable()
export class GameSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameSync.name);

  constructor(private readonly store: Store) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.sync();
    } catch (error) {
      // The café must start even if the game library cannot be synced.
      this.logger.error(`Khu Chơi Game sync failed: ${(error as Error).message}`);
    }
  }

  async sync(): Promise<void> {
    const dir = this.findCatalogDir();
    if (!dir) {
      this.logger.warn('games/games.json not found; Khu Chơi Game keeps what is stored');
      return;
    }
    const catalog = (JSON.parse(readFileSync(join(dir, 'games.json'), 'utf8')) as { games: CatalogEntry[] }).games;
    const stored = new Map<string, GameRecord>((await this.store.listGames()).map((game) => [game.id, game]));
    const wanted = new Set<string>();
    let written = 0;
    let unchanged = 0;

    for (const entry of catalog) {
      if (!ID.test(entry.id)) {
        this.logger.warn(`Skipping "${entry.id}": id must be lowercase letters, digits and dashes`);
        continue;
      }
      wanted.add(entry.id);
      const bannerPath = join(dir, entry.banner);
      const romPath = join(dir, entry.rom);
      const contentType = IMAGE_TYPES[extname(entry.banner).toLowerCase()];
      if (!contentType || !existsSync(bannerPath) || !existsSync(romPath)) {
        this.logger.warn(`Skipping ${entry.id}: banner or .nes missing`);
        continue;
      }
      const rom = readFileSync(romPath);
      const banner = readFileSync(bannerPath);
      if (!rom.subarray(0, 4).equals(NES_MAGIC) || rom.length > MAX_ROM) {
        this.logger.warn(`Skipping ${entry.id}: ${entry.rom} is not a valid .nes (≤ 4 MB)`);
        continue;
      }
      const romSha256 = sha256(rom);
      const bannerSha256 = sha256(banner);
      const current = stored.get(entry.id);
      const same =
        current &&
        current.romSha256 === romSha256 &&
        current.bannerSha256 === bannerSha256 &&
        current.title === entry.title &&
        current.hint === (entry.hint ?? '') &&
        current.credit === (entry.credit ?? '') &&
        current.sortOrder === (entry.sortOrder ?? 0);
      if (same) {
        unchanged += 1;
        continue;
      }
      await this.store.upsertGame({
        id: entry.id,
        title: entry.title,
        hint: entry.hint ?? '',
        credit: entry.credit ?? '',
        sortOrder: entry.sortOrder ?? 0,
        banner: { data: banner, contentType, sha256: bannerSha256 },
        rom: { data: rom, sha256: romSha256 },
      });
      written += 1;
    }

    let removed = 0;
    for (const id of stored.keys()) {
      if (!wanted.has(id)) {
        await this.store.deleteGame(id);
        removed += 1;
      }
    }
    this.logger.log(`Khu Chơi Game synced from ${dir}: ${written} written, ${unchanged} unchanged, ${removed} removed`);
  }

  /** GAMES_DIR, or games/ at the repo root (the server runs from apps/server). */
  private findCatalogDir(): string | null {
    const candidates = [
      process.env.GAMES_DIR,
      resolve(process.cwd(), 'games'),
      resolve(process.cwd(), '..', '..', 'games'),
      resolve(__dirname, '..', '..', '..', '..', 'games'),
    ].filter((value): value is string => Boolean(value));
    return candidates.find((dir) => existsSync(join(dir, 'games.json'))) ?? null;
  }
}
