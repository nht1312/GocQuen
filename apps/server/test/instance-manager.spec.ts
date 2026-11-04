import { SEATS_BY_ID, SEAT_DEFINITIONS, WALK_SPEED, userSeats } from '@virtual-cafe/shared';
import { AppConfig } from '../src/config/app-config';
import { InstanceManager } from '../src/world/instance-manager.service';

function makeManager(overrides: Partial<AppConfig> = {}): InstanceManager {
  const config = new AppConfig();
  Object.assign(config, overrides);
  return new InstanceManager(config);
}

let seq = 0;
function join(manager: InstanceManager, name: string) {
  seq += 1;
  const id = `user-${seq}`;
  return manager.join({ id, displayName: name, avatar: { presetId: 'clay' } }, `socket-${seq}`);
}

/** Teleport a player next to a seat so sit() is not rejected for distance. */
function placeBeside(manager: InstanceManager, userId: string, seatId: string): void {
  const seat = SEATS_BY_ID.get(seatId)!;
  const player = manager.getPlayer(userId)!;
  player.presence.x = seat.x;
  player.presence.y = seat.y;
}

const GUEST_SEAT = userSeats()[0].seatId;

describe('InstanceManager — instances', () => {
  it('fills an instance before opening another one', () => {
    const manager = makeManager({ instanceCapacity: 2 } as Partial<AppConfig>);
    const a = join(manager, 'A');
    const b = join(manager, 'B');
    const c = join(manager, 'C');

    expect(a.instance.id).toBe(b.instance.id);
    expect(c.instance.id).not.toBe(a.instance.id);
    expect(manager.stats().instanceCount).toBe(2);
  });

  it('keeps players in different instances invisible to each other', () => {
    const manager = makeManager({ instanceCapacity: 1 } as Partial<AppConfig>);
    const a = join(manager, 'A');
    const b = join(manager, 'B');

    const snapshot = manager.snapshotFor(a.player.presence.userId)!;
    expect(snapshot.players).toHaveLength(0);
    expect(snapshot.instanceId).not.toBe(b.instance.id);
  });

  it('closes an instance once the last person leaves', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    manager.remove(a.player.presence.userId);
    expect(manager.stats().instanceCount).toBe(0);
  });
});

describe('InstanceManager — seats', () => {
  it('lets exactly one of two racing players claim a seat', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const b = join(manager, 'B');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    placeBeside(manager, b.player.presence.userId, GUEST_SEAT);

    const first = manager.sit(a.player.presence.userId, GUEST_SEAT);
    const second = manager.sit(b.player.presence.userId, GUEST_SEAT);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('conflict');
  });

  it('refuses a seat the player cannot reach', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const result = manager.sit(a.player.presence.userId, GUEST_SEAT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('forbidden');
  });

  it('refuses seats reserved for NPCs', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const npcSeat = SEAT_DEFINITIONS.find((seat) => seat.npcOnly)!;
    placeBeside(manager, a.player.presence.userId, npcSeat.seatId);
    const result = manager.sit(a.player.presence.userId, npcSeat.seatId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('forbidden');
  });

  it('releases the previous seat when moving to another one', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const [first, second] = userSeats();
    placeBeside(manager, a.player.presence.userId, first.seatId);
    manager.sit(a.player.presence.userId, first.seatId);
    placeBeside(manager, a.player.presence.userId, second.seatId);
    const result = manager.sit(a.player.presence.userId, second.seatId);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.releasedSeatId).toBe(first.seatId);
    const occupancy = manager.seatOccupancy(a.instance);
    expect(occupancy.find((s) => s.seatId === first.seatId)?.userId).toBeNull();
    expect(occupancy.find((s) => s.seatId === second.seatId)?.userId).toBe(a.player.presence.userId);
  });

  it('frees the seat when the player stands up', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    manager.sit(a.player.presence.userId, GUEST_SEAT);
    const result = manager.stand(a.player.presence.userId)!;
    expect(result.releasedSeatId).toBe(GUEST_SEAT);
    expect(a.instance.seats.has(GUEST_SEAT)).toBe(false);
  });
});

describe('InstanceManager — movement authority', () => {
  it('rejects movement faster than the walk speed', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const player = a.player;
    const result = manager.move(player.presence.userId, {
      sequence: 1,
      x: player.presence.x + WALK_SPEED * 10,
      y: player.presence.y,
      direction: 'south_east',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('speed');
  });

  it('rejects movement into a solid object', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const player = a.player;
    // The west wall sits at x = 0 and is always blocked.
    player.presence.x = 1.0;
    player.presence.y = 12;
    player.lastMoveAt = Date.now() - 500;
    const result = manager.move(player.presence.userId, {
      sequence: 1,
      x: 0.2,
      y: 12,
      direction: 'north_west',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('collision');
  });

  it('rejects movement while seated', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    manager.sit(a.player.presence.userId, GUEST_SEAT);
    const result = manager.move(a.player.presence.userId, {
      sequence: 2,
      x: a.player.presence.x + 0.1,
      y: a.player.presence.y,
      direction: 'south',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('seated');
  });

  it('ignores stale sequence numbers without correcting the client', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const userId = a.player.presence.userId;
    a.player.lastMoveAt = Date.now() - 300;
    manager.move(userId, { sequence: 5, x: a.player.presence.x + 0.2, y: a.player.presence.y, direction: 'south' });
    const before = { ...a.player.presence };
    const result = manager.move(userId, { sequence: 4, x: 99, y: 99, direction: 'south' });
    expect(result.ok).toBe(true);
    expect(a.player.presence.x).toBe(before.x);
  });
});

describe('InstanceManager — voice scope', () => {
  it('refuses voice to a player who is not seated', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const result = manager.voiceJoin(a.player.presence.userId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('forbidden');
  });

  it('grants only the group of the seat the player actually occupies', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const seat = userSeats()[0];
    const otherGroup = userSeats().find((s) => s.seatGroupId !== seat.seatGroupId)!;
    placeBeside(manager, a.player.presence.userId, seat.seatId);
    manager.sit(a.player.presence.userId, seat.seatId);

    const spoofed = manager.voiceJoin(a.player.presence.userId, otherGroup.seatGroupId);
    expect(spoofed.ok).toBe(false);

    const granted = manager.voiceJoin(a.player.presence.userId);
    expect(granted.ok).toBe(true);
    if (granted.ok) expect(granted.groupId).toBe(seat.seatGroupId);
  });

  it('never turns the microphone on just because voice was joined', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    manager.sit(a.player.presence.userId, GUEST_SEAT);
    manager.voiceJoin(a.player.presence.userId);
    expect(a.player.presence.voice.micOn).toBe(false);
  });

  it('refuses to publish audio without a group', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const presence = manager.setVoiceState(a.player.presence.userId, true)!;
    expect(presence.voice.micOn).toBe(false);
  });

  it('scopes group membership to the table, not the instance', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const b = join(manager, 'B');
    const seats = userSeats();
    const seatA = seats[0];
    const seatB = seats.find((s) => s.seatGroupId !== seatA.seatGroupId)!;

    placeBeside(manager, a.player.presence.userId, seatA.seatId);
    manager.sit(a.player.presence.userId, seatA.seatId);
    manager.voiceJoin(a.player.presence.userId);

    placeBeside(manager, b.player.presence.userId, seatB.seatId);
    manager.sit(b.player.presence.userId, seatB.seatId);
    manager.voiceJoin(b.player.presence.userId);

    expect(manager.groupMembers(a.instance, seatA.seatGroupId)).toEqual([a.player.presence.userId]);
    expect(manager.groupMembers(a.instance, seatB.seatGroupId)).toEqual([b.player.presence.userId]);
  });

  it('drops the player out of voice when they leave the table', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    manager.sit(a.player.presence.userId, GUEST_SEAT);
    manager.voiceJoin(a.player.presence.userId);
    manager.setVoiceState(a.player.presence.userId, true);
    expect(a.player.presence.voice.micOn).toBe(true);

    manager.stand(a.player.presence.userId);
    expect(a.player.presence.voice.groupId).toBeNull();
    expect(a.player.presence.voice.micOn).toBe(false);
  });

  it('restores the status the player had before the conversation', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    manager.setStatus(a.player.presence.userId, 'working');
    placeBeside(manager, a.player.presence.userId, GUEST_SEAT);
    manager.sit(a.player.presence.userId, GUEST_SEAT);
    manager.voiceJoin(a.player.presence.userId);
    expect(a.player.presence.status).toBe('in_conversation');
    manager.voiceLeave(a.player.presence.userId);
    expect(a.player.presence.status).toBe('working');
  });

  it('does not let a client assign itself the in_conversation status', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    manager.setStatus(a.player.presence.userId, 'in_conversation');
    expect(a.player.presence.status).toBe('available');
  });
});

describe('InstanceManager — reconnect', () => {
  it('keeps the seat during the grace period and never resumes the mic', () => {
    const manager = makeManager();
    const a = join(manager, 'A');
    const userId = a.player.presence.userId;
    placeBeside(manager, userId, GUEST_SEAT);
    manager.sit(userId, GUEST_SEAT);
    manager.voiceJoin(userId);
    manager.setVoiceState(userId, true);

    manager.detach(userId);
    expect(a.instance.seats.get(GUEST_SEAT)).toBe(userId);

    const again = manager.join({ id: userId, displayName: 'A', avatar: { presetId: 'clay' } }, 'socket-new');
    expect(again.reconnected).toBe(true);
    expect(again.player.presence.seatId).toBe(GUEST_SEAT);
    expect(again.player.presence.voice.micOn).toBe(false);
    expect(again.player.presence.voice.groupId).toBeNull();
    expect(manager.stats().instanceCount).toBe(1);
  });

  it('releases the seat and the avatar once the grace period expires', () => {
    jest.useFakeTimers();
    const manager = makeManager({ disconnectGraceSeconds: 1 } as Partial<AppConfig>);
    const a = join(manager, 'A');
    const userId = a.player.presence.userId;
    const expired: string[] = [];
    manager.on('player-expired', ({ userId: id }) => expired.push(id));

    placeBeside(manager, userId, GUEST_SEAT);
    manager.sit(userId, GUEST_SEAT);
    manager.detach(userId);
    jest.advanceTimersByTime(1500);

    expect(expired).toEqual([userId]);
    expect(manager.getPlayer(userId)).toBeUndefined();
    expect(a.instance.seats.has(GUEST_SEAT)).toBe(false);
    jest.useRealTimers();
  });
});
