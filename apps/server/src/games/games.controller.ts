import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { GameSummary } from '@virtual-cafe/shared';
import { SessionGuard } from '../auth/session.guard';
import { AppConfig } from '../config/app-config';
import { Store } from '../storage/store';

const ID = /^[a-z0-9-]{1,40}$/;
const MAX_ROM = 2 * 1024 * 1024;
const MAX_BANNER = 1024 * 1024;
/** Every iNES / NES 2.0 file starts with these four bytes. */
const NES_MAGIC = Buffer.from([0x4e, 0x45, 0x53, 0x1a]);

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(80),
  hint: z.string().trim().max(200).default(''),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  banner: z.object({
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z.string().min(1),
  }),
  rom: z.object({ base64: z.string().min(1) }),
});

function checkId(id: string): string {
  if (!ID.test(id)) throw new BadRequestException('Mã game không hợp lệ');
  return id;
}

/**
 * Khu Chơi Game library, stored in the database (Store.games).
 *
 *   GET  /games             — the list (no files), public
 *   GET  /games/:id/banner  — the banner image, public and cacheable
 *   GET  /games/:id/rom     — the .nes file, guest session required
 *   PUT  /games/:id         — add or replace a game, needs GAMES_ADMIN_TOKEN
 */
@Controller('games')
export class GamesController {
  constructor(
    private readonly store: Store,
    private readonly config: AppConfig,
  ) {}

  @Get()
  async list(): Promise<{ games: GameSummary[] }> {
    const games = await this.store.listGames();
    return {
      games: games.map((game) => ({
        id: game.id,
        title: game.title,
        hint: game.hint,
        bannerUrl: `/games/${game.id}/banner?v=${game.updatedAt}`,
        romUrl: `/games/${game.id}/rom?v=${game.updatedAt}`,
      })),
    };
  }

  @Get(':id/banner')
  async banner(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.store.getGameBanner(checkId(id));
    if (!file) throw new NotFoundException('Không tìm thấy game');
    response.setHeader('Content-Type', file.contentType);
    // The URL carries ?v=updatedAt, so a replaced banner gets a new URL.
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(file.data);
  }

  @Get(':id/rom')
  @UseGuards(SessionGuard)
  async rom(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.store.getGameRom(checkId(id));
    if (!file) throw new NotFoundException('Không tìm thấy game');
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.send(file.data);
  }

  @Put(':id')
  async upsert(
    @Param('id') id: string,
    @Headers('x-admin-token') token: string | undefined,
    @Body() body: unknown,
  ): Promise<{ saved: string }> {
    const expected = this.config.gamesAdminToken;
    if (!expected) throw new ForbiddenException('Tải game lên đang bị tắt (thiếu GAMES_ADMIN_TOKEN)');
    const given = Buffer.from(token ?? '');
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new ForbiddenException('Sai mã quản trị');
    }

    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Dữ liệu game không hợp lệ');
    const input = parsed.data;
    const rom = Buffer.from(input.rom.base64, 'base64');
    const banner = Buffer.from(input.banner.base64, 'base64');
    if (rom.length === 0 || rom.length > MAX_ROM) throw new BadRequestException('File .nes quá lớn hoặc rỗng');
    if (!rom.subarray(0, 4).equals(NES_MAGIC)) throw new BadRequestException('Đây không phải file .nes hợp lệ');
    if (banner.length === 0 || banner.length > MAX_BANNER) throw new BadRequestException('Ảnh banner quá lớn hoặc rỗng');

    await this.store.upsertGame({
      id: checkId(id),
      title: input.title,
      hint: input.hint,
      sortOrder: input.sortOrder,
      banner: { data: banner, contentType: input.banner.contentType },
      rom,
    });
    return { saved: id };
  }
}
