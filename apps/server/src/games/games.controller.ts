import { BadRequestException, Controller, Get, Headers, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { GameSummary } from '@virtual-cafe/shared';
import { Store, type StoredFile } from '../storage/store';

const ID = /^[a-z0-9-]{1,40}$/;

function checkId(id: string): string {
  if (!ID.test(id)) throw new BadRequestException('Mã game không hợp lệ');
  return id;
}

/**
 * Khu Chơi Game library, read from the `games` table (filled by GameSync).
 *
 *   GET /games              — the list, no files
 *   GET /games/:id/banner   — banner image
 *   GET /games/:id/rom      — the .nes file
 *
 * File URLs carry the file's sha256 (?v=…), so a URL always means the same
 * bytes: browsers and CDNs cache them for a year, a changed file simply gets
 * a new URL, and ETag lets a revalidation answer 304 with no body.
 */
@Controller('games')
export class GamesController {
  constructor(private readonly store: Store) {}

  @Get()
  async list(): Promise<{ games: GameSummary[] }> {
    const games = await this.store.listGames();
    return {
      games: games.map((game) => ({
        id: game.id,
        title: game.title,
        hint: game.hint,
        credit: game.credit,
        bannerUrl: `/games/${game.id}/banner?v=${game.bannerSha256.slice(0, 16)}`,
        romUrl: `/games/${game.id}/rom?v=${game.romSha256.slice(0, 16)}`,
      })),
    };
  }

  @Get(':id/banner')
  async banner(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    send(response, await this.store.getGameBanner(checkId(id)), ifNoneMatch);
  }

  @Get(':id/rom')
  async rom(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    send(response, await this.store.getGameRom(checkId(id)), ifNoneMatch);
  }
}

function send(response: Response, file: StoredFile | null, ifNoneMatch: string | undefined): void {
  if (!file) throw new NotFoundException('Không tìm thấy game');
  const etag = `"${file.sha256}"`;
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (ifNoneMatch === etag) {
    response.status(304).end();
    return;
  }
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Length', String(file.data.length));
  response.send(file.data);
}
