import { MemoryStore } from '../src/storage/memory.store';

function session(overrides: Partial<Parameters<MemoryStore['recordScreenShareStart']>[0]> = {}) {
  return {
    id: 'session-1',
    instanceId: 'instance-1',
    groupId: 'group_a',
    publisherId: 'user-1',
    startedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('Store — screen-share session metadata', () => {
  it('records a started session as active', async () => {
    const store = new MemoryStore();
    await store.recordScreenShareStart(session());

    const record = await store.findScreenShareSession('session-1');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('active');
    expect(record?.groupId).toBe('group_a');
    expect(record?.publisherId).toBe('user-1');
    expect(record?.endedAt).toBeNull();
  });

  it('marks a session ended with its reason and time', async () => {
    const store = new MemoryStore();
    await store.recordScreenShareStart(session());

    await store.recordScreenShareEnd('session-1', 'left_table', 1_700_000_060_000);

    const record = await store.findScreenShareSession('session-1');
    expect(record?.status).toBe('ended');
    expect(record?.endReason).toBe('left_table');
    expect(record?.endedAt).toBe(1_700_000_060_000);
  });

  it('keeps the first ending when a session is ended twice', async () => {
    const store = new MemoryStore();
    await store.recordScreenShareStart(session());
    await store.recordScreenShareEnd('session-1', 'manual', 1_700_000_060_000);

    // A sweep can race a manual stop; the first explanation is the true one.
    await store.recordScreenShareEnd('session-1', 'disconnected', 1_700_000_090_000);

    const record = await store.findScreenShareSession('session-1');
    expect(record?.endReason).toBe('manual');
    expect(record?.endedAt).toBe(1_700_000_060_000);
  });

  it('ignores an ending for a session it never saw start', async () => {
    const store = new MemoryStore();

    // The audit write is fire-and-forget, so an end can arrive with no start
    // if the start write failed. It must not throw into the live session.
    await expect(store.recordScreenShareEnd('never-seen', 'manual', 1)).resolves.toBeUndefined();
    expect(await store.findScreenShareSession('never-seen')).toBeNull();
  });

  it('returns null for a session that does not exist', async () => {
    const store = new MemoryStore();
    expect(await store.findScreenShareSession('nope')).toBeNull();
  });

  it('stores metadata only, never anything resembling screen content', async () => {
    const store = new MemoryStore();
    await store.recordScreenShareStart(session());

    const record = await store.findScreenShareSession('session-1');
    expect(Object.keys(record ?? {}).sort()).toEqual(
      [
        'endReason',
        'endedAt',
        'groupId',
        'id',
        'instanceId',
        'publisherId',
        'startedAt',
        'status',
      ].sort(),
    );
  });
});
