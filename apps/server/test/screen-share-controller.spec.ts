import { SEATS_BY_ID, userSeats } from '@virtual-cafe/shared';
import { AppConfig } from '../src/config/app-config';
import { MemoryStore } from '../src/storage/memory.store';
import { InstanceManager } from '../src/world/instance-manager.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { ScreenShareController } from '../src/voice/screen-share.controller';
import { ScreenShareService } from '../src/voice/screen-share.service';
import { VoiceService } from '../src/voice/voice.service';
import type { AuthedRequest } from '../src/auth/session.guard';

function makeController() {
  const config = new AppConfig();
  const manager = new InstanceManager(config);
  const screen = new ScreenShareService(manager, new MemoryStore());
  const voice = new VoiceService(config, manager, screen);
  const controller = new ScreenShareController(screen, voice, new MetricsService(manager));
  return { manager, screen, controller };
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

/** The shape SessionGuard puts on the request. */
function asRequest(userId: string, name: string): AuthedRequest {
  return { session: { sub: userId, name } } as AuthedRequest;
}

const tableA = userSeats().filter((s) => s.seatGroupId === 'group_a');
const tableB = userSeats().filter((s) => s.seatGroupId === 'group_b');

describe('ScreenShareController — reading state', () => {
  it('reports nothing active when no one is sharing', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    const state = controller.state(asRequest(alice.presence.userId, 'Alice'));
    expect(state.active).toBe(false);
    expect(state.session).toBeNull();
  });

  it('reports the active session to a member of that table', () => {
    const { manager, screen, controller } = makeController();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    const state = controller.state(asRequest(bob.presence.userId, 'Bob'));
    expect(state.active).toBe(true);
    expect(state.session?.publisherName).toBe('Alice');
  });

  it('tells another table nothing at all', () => {
    const { manager, screen, controller } = makeController();
    const alice = join(manager, 'Alice');
    const carol = join(manager, 'Carol');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, carol.presence.userId, tableB[0].seatId);
    screen.claim(alice.presence.userId);

    const state = controller.state(asRequest(carol.presence.userId, 'Carol'));
    expect(state.active).toBe(false);
    expect(state.session).toBeNull();
  });

  it('lets a late joiner discover a session already in progress', () => {
    const { manager, screen, controller } = makeController();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    screen.claim(alice.presence.userId);

    // Bob sits down after the share began and must still find it over HTTP,
    // without having been present for the socket event.
    seat(manager, bob.presence.userId, tableA[1].seatId);
    expect(controller.state(asRequest(bob.presence.userId, 'Bob')).active).toBe(true);
  });
});

describe('ScreenShareController — starting', () => {
  it('starts a session for a seated caller', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    const state = controller.start(asRequest(alice.presence.userId, 'Alice'));
    expect(state.active).toBe(true);
    expect(state.session?.publisherId).toBe(alice.presence.userId);
  });

  it('refuses a caller who is not seated', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');

    expect(() => controller.start(asRequest(alice.presence.userId, 'Alice'))).toThrow();
  });

  it('refuses a second publisher at the same table', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    controller.start(asRequest(alice.presence.userId, 'Alice'));

    expect(() => controller.start(asRequest(bob.presence.userId, 'Bob'))).toThrow();
  });
});

describe('ScreenShareController — stopping', () => {
  it('lets the publisher stop their own session', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    controller.start(asRequest(alice.presence.userId, 'Alice'));

    const state = controller.stop(asRequest(alice.presence.userId, 'Alice'));
    expect(state.active).toBe(false);
    expect(state.session).toBeNull();
  });

  it('refuses a table-mate trying to stop someone else', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    controller.start(asRequest(alice.presence.userId, 'Alice'));

    expect(() => controller.stop(asRequest(bob.presence.userId, 'Bob'))).toThrow();
    expect(controller.state(asRequest(alice.presence.userId, 'Alice')).active).toBe(true);
  });

  it('refuses another table trying to stop a session', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    const carol = join(manager, 'Carol');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, carol.presence.userId, tableB[0].seatId);
    controller.start(asRequest(alice.presence.userId, 'Alice'));

    expect(() => controller.stop(asRequest(carol.presence.userId, 'Carol'))).toThrow();
    expect(controller.state(asRequest(alice.presence.userId, 'Alice')).active).toBe(true);
  });
});

describe('ScreenShareController — rate limiting', () => {
  it('stops a caller flipping the session on and off in a tight loop', () => {
    const { manager, controller } = makeController();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    const request = asRequest(alice.presence.userId, 'Alice');

    let refusedAt = -1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        controller.start(request);
        controller.stop(request);
      } catch {
        refusedAt = attempt;
        break;
      }
    }

    expect(refusedAt).toBeGreaterThan(-1);
  });
});
