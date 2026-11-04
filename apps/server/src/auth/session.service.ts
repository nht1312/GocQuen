import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { AVATAR_PRESETS, AvatarConfig, AvatarPresetId, GuestSession } from '@virtual-cafe/shared';
import { AppConfig } from '../config/app-config';
import { Store } from '../storage/store';

export interface SessionClaims {
  sub: string;
  name: string;
  preset: AvatarPresetId;
  exp: number;
}

const NAME_PARTS = {
  adjective: ['Quiet', 'Warm', 'Golden', 'Slow', 'Soft', 'Bright', 'Calm', 'Amber', 'Hazel', 'Rainy'],
  noun: ['Latte', 'Cortado', 'Filter', 'Ember', 'Fern', 'Maple', 'Linen', 'Clover', 'Pebble', 'Willow'],
};

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Guest sessions (SPEC 4.1, 13.1). Entering the café must not require an
 * account, so the token is the whole identity: short-lived, signed, and
 * carrying nothing the client could usefully forge — instance membership and
 * voice scope are resolved server-side from this subject.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly config: AppConfig,
    private readonly store: Store,
  ) {}

  static randomDisplayName(): string {
    return `${randomOf(NAME_PARTS.adjective)} ${randomOf(NAME_PARTS.noun)}`;
  }

  static randomAvatar(): AvatarConfig {
    return { presetId: randomOf(AVATAR_PRESETS).id };
  }

  async createGuest(requestedName?: string): Promise<GuestSession> {
    const displayName = SessionService.sanitiseName(requestedName) ?? SessionService.randomDisplayName();
    const avatar = SessionService.randomAvatar();
    const user = await this.store.createGuestUser(displayName, avatar);
    return this.issue(user.id, user.displayName, user.avatar);
  }

  issue(userId: string, displayName: string, avatar: AvatarConfig): GuestSession {
    const expiresAt = Math.floor(Date.now() / 1000) + this.config.sessionTtlSeconds;
    const token = jwt.sign(
      { sub: userId, name: displayName, preset: avatar.presetId, exp: expiresAt },
      this.config.sessionSecret,
    );
    return { token, userId, displayName, avatar, expiresAt: expiresAt * 1000 };
  }

  verify(token: string | undefined): SessionClaims {
    if (!token) throw new UnauthorizedException('Thiếu mã phiên đăng nhập');
    try {
      return jwt.verify(token, this.config.sessionSecret) as SessionClaims;
    } catch {
      throw new UnauthorizedException('Mã phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }
  }

  /** Returns null for empty input so the caller can fall back to a random name. */
  static sanitiseName(value: string | undefined | null): string | null {
    if (!value) return null;
    const cleaned = value
      .replace(/[\p{C}]/gu, '')
      .trim()
      .slice(0, 24);
    return cleaned.length >= 2 ? cleaned : null;
  }
}
