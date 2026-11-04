import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { SEATS_BY_ID, VoiceTokenResult } from '@virtual-cafe/shared';
import { AppConfig } from '../config/app-config';
import { InstanceManager } from '../world/instance-manager.service';
import { ScreenShareService } from './screen-share.service';

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
    private readonly screenShare: ScreenShareService,
  ) {}

  static roomName(instanceId: string, groupId: string): string {
    return `cafe__${instanceId}__${groupId}`;
  }

  /**
   * The screen-share room for a table, deliberately separate from its voice
   * room.
   *
   * They could have shared one room, and that would have been less code. But
   * the voice grant carries `canSubscribe`, so anyone holding a token for the
   * voice room can hear everyone at that table. Watching a screen does not
   * require joining the conversation, so sharing a room would have handed
   * every viewer the table's audio without them ever choosing to listen —
   * silently undoing the rule that hearing a table is a deliberate act.
   *
   * Two rooms keep the two permissions independent: voice stays
   * microphone-only and opt-in, and a screen token carries no microphone at
   * all.
   */
  static screenRoomName(instanceId: string, groupId: string): string {
    return `cafe__${instanceId}__${groupId}__screen`;
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
          // Voice only. Screen media lives in a separate room per table
          // (see `issueScreenToken`), so this grant never needs widening.
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

  /**
   * A token for the caller's own table's screen room.
   *
   * Requires only that they are seated there — watching a shared screen is not
   * conditional on joining the conversation. Publishing is a separate matter:
   * `screen_share` is granted only to whoever holds the slot, so a viewer who
   * modifies their client still cannot publish, and cannot talk over an
   * existing share.
   */
  issueScreenToken(userId: string, displayName: string): VoiceTokenResult {
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
      return { ...base, reason: 'Máy chủ này chưa cấu hình tính năng chia sẻ màn hình' };
    }

    const instance = this.instances.findInstanceOf(userId);
    const player = instance?.players.get(userId);
    if (!instance || !player) return { ...base, reason: 'Bạn chưa ở trong quán' };

    const seatId = player.presence.seatId;
    const groupId = seatId ? SEATS_BY_ID.get(seatId)?.seatGroupId : undefined;
    if (!groupId) {
      return { ...base, reason: 'Hãy ngồi vào bàn để xem màn hình được chia sẻ' };
    }

    const room = VoiceService.screenRoomName(instance.id, groupId);
    const mayPublish = this.screenShare.mayPublishScreen(userId);
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
          canPublish: mayPublish,
          canSubscribe: true,
          canPublishData: false,
          // No microphone here under any circumstances: the conversation is
          // in the other room and must stay opt-in.
          canPublishSources: mayPublish ? ['screen_share'] : [],
          roomRecord: false,
        },
      },
      this.config.livekitApiSecret as string,
    );

    this.logger.log(`Issued screen token for ${identity} scoped to ${room}`);
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
