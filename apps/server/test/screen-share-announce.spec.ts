import { SEATS_BY_ID, userSeats } from '@virtual-cafe/shared';
import { AppConfig } from '../src/config/app-config';
import { MemoryStore } from '../src/storage/memory.store';
import { InstanceManager } from '../src/world/instance-manager.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { ScreenShareController } from '../src/voice/screen-share.controller';
import {
  ScreenShareEndReason,
  ScreenShareService,
  ScreenShareSession,
} from '../src/voice/screen-share.service';
import { VoiceService } from '../src/voice/voice.service';
import type { AuthedRequest } from '../src/auth/session.guard';

/**
 * The REST endpoints and the socket events are two doors onto the same slot.
 * Whichever one is used, the table has to be told — the web client uses the
 * REST door, and a start nobody hears about is a share nobody can watch.
 */
function makeController() {
  const config = new AppConfig();
  const manager = new InstanceManager(config);
  const screen = new ScreenShareService(manager, new MemoryStore());
  const voice = new VoiceService(config, manager, screen);
  const controller = new ScreenShareController(screen, voice, new MetricsService(manager));

  const started: ScreenShareSession[] = [];
  const stopped: { session: ScreenShareSession; reason: ScreenShareEndReason }[] = [];
  screen.observe({
    onScreenShareStarted: (session) => started.push(session),
    onScreenShareStopped: (session, reason) => stopped.push({ session, reason }),
  });

  return { manager, screen, controller, started, stopped };
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

function asRequest(userId: string, name: string): AuthedRequest {
  return { session: { sub: userId, name } } as AuthedRequest;
}

const tableA = userSeats().filter((s) => s.seatGroupId === 'group_a');

describe('starting a share over REST announces it', () => {
  it('tells the table when the slot is claimed', () => {
    const { manager, controller, started } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    controller.start(asRequest(alice.presence.userId, 'Alice'));

    expect(started).toHaveLength(1);
    expect(started[0].publisherId).toBe(alice.presence.userId);
    expect(started[0].groupId).toBe('group_a');
  });

  it('tells the table when the publisher stops', () => {
    const { manager, controller, stopped } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    controller.start(asRequest(alice.presence.userId, 'Alice'));
    controller.stop(asRequest(alice.presence.userId, 'Alice'));

    expect(stopped).toHaveLength(1);
    expect(stopped[0].reason).toBe('manual');
  });

  it('does not announce a re-claim of a slot already held', () => {
    const { manager, controller, started } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    controller.start(asRequest(alice.presence.userId, 'Alice'));
    controller.start(asRequest(alice.presence.userId, 'Alice'));

    expect(started).toHaveLength(1);
  });
});
