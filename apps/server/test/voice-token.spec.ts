import jwt from 'jsonwebtoken';
import { SEATS_BY_ID, userSeats } from '@virtual-cafe/shared';
import { AppConfig } from '../src/config/app-config';
import { InstanceManager } from '../src/world/instance-manager.service';
import { ScreenShareService } from '../src/voice/screen-share.service';
import { VoiceService } from '../src/voice/voice.service';

const SECRET = 'test-secret-not-a-real-livekit-key';

function makeServices() {
  const config = new AppConfig();
  // voiceAvailable is derived from these three, so the token path is live.
  Object.assign(config, {
    livekitUrl: 'wss://test.livekit.cloud',
    livekitApiKey: 'APItest',
    livekitApiSecret: SECRET,
  });
  const manager = new InstanceManager(config);
  const screen = new ScreenShareService(manager);
  return { manager, screen, voice: new VoiceService(config, manager, screen) };
}

let seq = 0;
function join(manager: InstanceManager, name: string) {
  seq += 1;
  const id = `user-${seq}`;
  return manager.join({ id, displayName: name, avatar: { presetId: 'clay' } }, `socket-${seq}`)
    .player;
}

function seat(manager: InstanceManager, userId: string, seatId: string): void {
  const seatDef = SEATS_BY_ID.get(seatId);
  if (!seatDef) throw new Error(`unknown seat ${seatId}`);
  const player = manager.getPlayer(userId);
  if (!player) throw new Error(`unknown player ${userId}`);
  player.presence.x = seatDef.x;
  player.presence.y = seatDef.y;
  const result = manager.sit(userId, seatId);
  if (!result.ok) throw new Error(`sit failed: ${result.message}`);
}

interface VideoGrant {
  room?: string;
  roomJoin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishSources?: string[];
  roomRecord?: boolean;
}

/** Read the grant the way LiveKit would, by verifying the signature. */
function grantOf(token: string): VideoGrant {
  const payload = jwt.verify(token, SECRET) as { video?: VideoGrant };
  if (!payload.video) throw new Error('token carries no video grant');
  return payload.video;
}

const tableA = userSeats().filter((s) => s.seatGroupId === 'group_a');

describe('VoiceService — screen-share publish permission', () => {
  it('does not let a plain voice participant publish a screen', () => {
    const { manager, voice } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    manager.voiceJoin(alice.presence.userId);

    const result = voice.issueToken(alice.presence.userId, 'Alice');
    expect(result.token).not.toBeNull();
    const grant = grantOf(result.token as string);

    expect(grant.canPublishSources).toEqual(['microphone']);
  });

  it('lets the table’s screen-share publisher publish a screen', () => {
    const { manager, screen, voice } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    manager.voiceJoin(alice.presence.userId);
    expect(screen.claim(alice.presence.userId).ok).toBe(true);

    const grant = grantOf(voice.issueToken(alice.presence.userId, 'Alice').token as string);

    expect(grant.canPublishSources).toContain('screen_share');
    // Taking the screen slot must not cost them the microphone.
    expect(grant.canPublishSources).toContain('microphone');
  });

  it('does not let a viewer at the same table publish a screen', () => {
    const { manager, screen, voice } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    manager.voiceJoin(alice.presence.userId);
    manager.voiceJoin(bob.presence.userId);
    screen.claim(alice.presence.userId);

    // Bob is legitimately in the room and can watch, but a modified client
    // must not be able to publish a second screen.
    const grant = grantOf(voice.issueToken(bob.presence.userId, 'Bob').token as string);

    expect(grant.canPublishSources).toEqual(['microphone']);
  });

  it('revokes screen publishing once the publisher releases the slot', () => {
    const { manager, screen, voice } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    manager.voiceJoin(alice.presence.userId);
    screen.claim(alice.presence.userId);
    screen.release(alice.presence.userId, 'manual');

    const grant = grantOf(voice.issueToken(alice.presence.userId, 'Alice').token as string);

    expect(grant.canPublishSources).toEqual(['microphone']);
  });

  it('never grants screen recording, publisher or not', () => {
    const { manager, screen, voice } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    manager.voiceJoin(alice.presence.userId);
    screen.claim(alice.presence.userId);

    const grant = grantOf(voice.issueToken(alice.presence.userId, 'Alice').token as string);

    expect(grant.roomRecord).toBe(false);
  });

  it('still scopes the token to the caller’s own table room', () => {
    const { manager, screen, voice } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    manager.voiceJoin(alice.presence.userId);
    screen.claim(alice.presence.userId);

    const result = voice.issueToken(alice.presence.userId, 'Alice');
    const grant = grantOf(result.token as string);

    expect(grant.room).toMatch(/__group_a$/);
    expect(grant.room).toBe(result.room);
    expect(grant.roomJoin).toBe(true);
  });
});
