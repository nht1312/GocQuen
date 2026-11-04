import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { VoiceTokenResult } from '@virtual-cafe/shared';
import { AppConfig } from '../config/app-config';
import { InstanceManager } from '../world/instance-manager.service';

/**
 * Voice access control (SPEC 6.2, 6.3, 14.1).
 *
 * The privacy rule is enforced by the room name, not by client behaviour: every
 * conversation group gets its own SFU room scoped to one instance and one
 * table, so a client that is not in that group has nothing to subscribe to.
 * Tokens are short-lived and may only publish into the caller's own group.
 *
 * A LiveKit access token is a plain JWT with a `video` grant, so it is minted
 * here directly rather than pulling in the server SDK.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly instances: InstanceManager,
  ) {}

  static roomName(instanceId: string, groupId: string): string {
    return `cafe__${instanceId}__${groupId}`;
  }

  issueToken(userId: string, displayName: string): VoiceTokenResult {
    const identity = userId;
    const base: VoiceTokenResult = {
      available: this.config.voiceAvailable,
      token: null,
      url: this.config.livekitUrl,
      room: null,
      identity,
      groupId: null,
      expiresAt: null,
    };

    if (!this.config.voiceAvailable) {
      return { ...base, reason: 'Máy chủ này chưa cấu hình tính năng giọng nói' };
    }

    const instance = this.instances.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) {
      return { ...base, reason: 'Bạn chưa ở trong quán' };
    }

    const groupId = player.presence.voice.groupId;
    if (!groupId) {
      // The server grants voice, never the client asking nicely for a room.
      return { ...base, reason: 'Hãy tham gia cuộc trò chuyện tại bàn trước khi dùng giọng nói' };
    }

    const room = VoiceService.roomName(instance.id, groupId);
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.config.voiceTokenTtlSeconds;
    const token = jwt.sign(
      {
        iss: this.config.livekitApiKey,
        sub: identity,
        nbf: issuedAt,
        exp: expiresAt,
        name: displayName,
        video: {
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: false,
          // Voice only (SPEC 2.3). Enforced in the grant, not just in the
          // client: the token cannot publish a camera or a screen share.
          canPublishSources: ['microphone'],
          // No recording, ever, by default (SPEC 14.2). `roomRecord` is the
          // documented grant field; the older `recorder` key is ignored.
          roomRecord: false,
        },
      },
      this.config.livekitApiSecret as string,
    );

    this.logger.log(`Issued voice token for ${identity} scoped to ${room}`);
    return {
      available: true,
      token,
      url: this.config.livekitUrl,
      room,
      identity,
      groupId,
      expiresAt: expiresAt * 1000,
    };
  }
}
