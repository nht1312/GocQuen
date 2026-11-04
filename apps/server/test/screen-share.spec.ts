import { SEATS_BY_ID, userSeats } from '@virtual-cafe/shared';
import { AppConfig } from '../src/config/app-config';
import { InstanceManager } from '../src/world/instance-manager.service';
import { ScreenShareService } from '../src/voice/screen-share.service';

function makeServices(): { manager: InstanceManager; screen: ScreenShareService } {
  const manager = new InstanceManager(new AppConfig());
  return { manager, screen: new ScreenShareService(manager) };
}

let seq = 0;
function join(manager: InstanceManager, name: string) {
  seq += 1;
  const id = `user-${seq}`;
  return manager.join({ id, displayName: name, avatar: { presetId: 'clay' } }, `socket-${seq}`)
    .player;
}

/** Put the player on a seat the way the server would see it. */
function seat(manager: InstanceManager, userId: string, seatId: string): void {
  const seatDef = SEATS_BY_ID.get(seatId);
  if (!seatDef) throw new Error(`unknown seat ${seatId}`);
  const player = manager.getPlayer(userId);
  if (!player) throw new Error(`unknown player ${userId}`);
  // Walking there through move() would be rejected as a speed violation, so
  // the avatar is placed beside the seat and sit() still verifies reach.
  player.presence.x = seatDef.x;
  player.presence.y = seatDef.y;
  const result = manager.sit(userId, seatId);
  if (!result.ok) throw new Error(`sit failed: ${result.message}`);
}

const tableA = userSeats().filter((s) => s.seatGroupId === 'group_a');
const tableB = userSeats().filter((s) => s.seatGroupId === 'group_b');

describe('ScreenShareService — who may publish', () => {
  it('refuses a player who is not in the café', () => {
    const { screen } = makeServices();
    const result = screen.claim('nobody');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('forbidden');
  });

  it('refuses a player who is standing rather than seated', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const result = screen.claim(alice.presence.userId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('forbidden');
  });

  it('grants the slot to a seated player and names their own table', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    const result = screen.claim(alice.presence.userId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.groupId).toBe('group_a');
      expect(result.session.publisherId).toBe(alice.presence.userId);
      expect(result.session.publisherName).toBe('Alice');
    }
  });
});

describe('ScreenShareService — one publisher per table', () => {
  it('refuses a second publisher at the same table', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);

    expect(screen.claim(alice.presence.userId).ok).toBe(true);
    const second = screen.claim(bob.presence.userId);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('conflict');
  });

  it('is idempotent for the player who already holds the slot', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);

    const first = screen.claim(alice.presence.userId);
    const again = screen.claim(alice.presence.userId);
    expect(again.ok).toBe(true);
    if (first.ok && again.ok) expect(again.session.id).toBe(first.session.id);
  });

  it('lets a different table share at the same time', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableB[0].seatId);

    expect(screen.claim(alice.presence.userId).ok).toBe(true);
    expect(screen.claim(bob.presence.userId).ok).toBe(true);
  });
});

describe('ScreenShareService — table isolation', () => {
  it('shows a session only to players seated at that table', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const carol = join(manager, 'Carol');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, carol.presence.userId, tableB[0].seatId);
    screen.claim(alice.presence.userId);

    expect(screen.visibleTo(alice.presence.userId)?.publisherId).toBe(alice.presence.userId);
    // Carol sits at another table and must learn nothing about group_a.
    expect(screen.visibleTo(carol.presence.userId)).toBeNull();
  });

  it('shows an already-active session to someone who joins the table later', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    screen.claim(alice.presence.userId);

    seat(manager, bob.presence.userId, tableA[1].seatId);
    expect(screen.visibleTo(bob.presence.userId)?.publisherId).toBe(alice.presence.userId);
  });

  it('refuses to let another table stop a session', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const carol = join(manager, 'Carol');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, carol.presence.userId, tableB[0].seatId);
    screen.claim(alice.presence.userId);

    const result = screen.release(carol.presence.userId, 'manual');
    expect(result.ok).toBe(false);
    expect(screen.visibleTo(alice.presence.userId)).not.toBeNull();
  });

  it('refuses to let a table-mate stop a session they do not own', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    expect(screen.release(bob.presence.userId, 'manual').ok).toBe(false);
    expect(screen.visibleTo(alice.presence.userId)).not.toBeNull();
  });
});

describe('ScreenShareService — publish authorization', () => {
  it('authorises screen publishing only for the slot holder', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    expect(screen.mayPublishScreen(alice.presence.userId)).toBe(true);
    // Bob may watch, but his token must not be able to publish a screen.
    expect(screen.mayPublishScreen(bob.presence.userId)).toBe(false);
  });

  it('stops authorising the publisher once they release the slot', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    screen.claim(alice.presence.userId);

    expect(screen.release(alice.presence.userId, 'manual').ok).toBe(true);
    expect(screen.mayPublishScreen(alice.presence.userId)).toBe(false);
    expect(screen.visibleTo(alice.presence.userId)).toBeNull();
  });
});

describe('ScreenShareService — the slot is released automatically', () => {
  it('frees the slot when the publisher stands up', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    manager.stand(alice.presence.userId);

    expect(screen.visibleTo(bob.presence.userId)).toBeNull();
    expect(screen.claim(bob.presence.userId).ok).toBe(true);
  });

  it('frees the old table when the publisher moves to another table', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    seat(manager, alice.presence.userId, tableB[0].seatId);

    // Nothing left behind at the table she walked away from.
    expect(screen.visibleTo(bob.presence.userId)).toBeNull();
    // And the session does not follow her to the new table.
    expect(screen.visibleTo(alice.presence.userId)).toBeNull();
    expect(screen.mayPublishScreen(alice.presence.userId)).toBe(false);
  });

  it('frees the slot when the publisher leaves the café', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    manager.remove(alice.presence.userId);

    expect(screen.visibleTo(bob.presence.userId)).toBeNull();
    expect(screen.claim(bob.presence.userId).ok).toBe(true);
  });

  it('stops sharing the moment the publisher disconnects, not when the seat expires', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    const bob = join(manager, 'Bob');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    seat(manager, bob.presence.userId, tableA[1].seatId);
    screen.claim(alice.presence.userId);

    manager.detach(alice.presence.userId);

    // The seat is deliberately held through the grace window...
    expect(manager.getPlayer(alice.presence.userId)?.presence.seatId).toBe(tableA[0].seatId);
    // ...but the screen is not still being shared to the table.
    expect(screen.visibleTo(bob.presence.userId)).toBeNull();
  });
});

describe('ScreenShareService — reporting a release for broadcast', () => {
  it('reports the ended session once so it is announced once', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    const claimed = screen.claim(alice.presence.userId);

    manager.stand(alice.presence.userId);

    const first = screen.releaseIfStale(alice.presence.userId, 'left_table');
    expect(first).not.toBeNull();
    if (first && claimed.ok) expect(first.id).toBe(claimed.session.id);
    // A second sweep has nothing left to announce.
    expect(screen.releaseIfStale(alice.presence.userId, 'left_table')).toBeNull();
  });

  it('reports nothing while the publisher is still seated and connected', () => {
    const { manager, screen } = makeServices();
    const alice = join(manager, 'Alice');
    seat(manager, alice.presence.userId, tableA[0].seatId);
    screen.claim(alice.presence.userId);

    expect(screen.releaseIfStale(alice.presence.userId, 'left_table')).toBeNull();
    expect(screen.visibleTo(alice.presence.userId)).not.toBeNull();
  });
});
