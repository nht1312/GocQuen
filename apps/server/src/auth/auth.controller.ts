import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AVATAR_PRESETS, AvatarPresetId, GuestSession } from '@virtual-cafe/shared';
import { Store } from '../storage/store';
import { AuthedRequest, SessionGuard } from './session.guard';
import { SessionService } from './session.service';

const guestSchema = z.object({ displayName: z.string().max(64).optional() });

const profileSchema = z.object({
  displayName: z.string().min(2).max(24).optional(),
  avatarPresetId: z
    .enum(AVATAR_PRESETS.map((preset) => preset.id) as [AvatarPresetId, ...AvatarPresetId[]])
    .optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message).join(', '));
  }
  return result.data;
}

@Controller()
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly store: Store,
  ) {}

  @Post('auth/guest')
  async createGuest(@Body() body: unknown): Promise<GuestSession> {
    const { displayName } = parse(guestSchema, body ?? {});
    return this.sessions.createGuest(displayName);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() request: AuthedRequest) {
    const user = await this.store.findUser(request.session.sub);
    if (!user) throw new NotFoundException('Phiên đăng nhập trỏ tới người dùng không tồn tại');
    return {
      userId: user.id,
      displayName: user.displayName,
      avatar: user.avatar,
      createdAt: user.createdAt,
    };
  }

  @Patch('me/profile')
  @UseGuards(SessionGuard)
  async updateProfile(@Req() request: AuthedRequest, @Body() body: unknown) {
    const patch = parse(profileSchema, body ?? {});
    const displayName = SessionService.sanitiseName(patch.displayName) ?? undefined;
    const user = await this.store.updateProfile(request.session.sub, {
      displayName,
      avatar: patch.avatarPresetId ? { presetId: patch.avatarPresetId } : undefined,
    });
    if (!user) throw new NotFoundException('Phiên đăng nhập trỏ tới người dùng không tồn tại');
    // The display name travels in the token, so hand back a refreshed one.
    return this.sessions.issue(user.id, user.displayName, user.avatar);
  }
}
