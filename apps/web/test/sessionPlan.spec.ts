import { planSessionBootstrap } from '@/lib/sessionPlan';

describe('planSessionBootstrap — arriving with no session', () => {
  it('creates a session using the name typed at the door', () => {
    const plan = planSessionBootstrap({ hasToken: false, pendingName: 'Mai', currentName: null });
    expect(plan).toEqual({ action: 'create', name: 'Mai' });
  });

  it('refuses to mint a session when no name was given', () => {
    // The door is the only way in; a nameless session must not be created.
    expect(planSessionBootstrap({ hasToken: false, pendingName: '', currentName: null })).toEqual({
      action: 'refuse',
    });
  });

  it('refuses when the name given is too short to use', () => {
    expect(planSessionBootstrap({ hasToken: false, pendingName: 'A', currentName: null })).toEqual({
      action: 'refuse',
    });
  });
});

describe('planSessionBootstrap — arriving with a session already stored', () => {
  it('renames when the door name differs from the session name', () => {
    // Bug 1: returning with a session meant the name just typed was ignored,
    // so the café kept showing whatever name the old session carried.
    const plan = planSessionBootstrap({
      hasToken: true,
      pendingName: 'Hoài Tú',
      currentName: 'Calm Fern',
    });
    expect(plan).toEqual({ action: 'rename', name: 'Hoài Tú' });
  });

  it('reuses the session when the name is unchanged', () => {
    expect(
      planSessionBootstrap({ hasToken: true, pendingName: 'Mai', currentName: 'Mai' }),
    ).toEqual({ action: 'reuse' });
  });

  it('reuses the session when no new name was typed', () => {
    // A refresh inside the café carries no pending name and must not rename.
    expect(planSessionBootstrap({ hasToken: true, pendingName: '', currentName: 'Mai' })).toEqual({
      action: 'reuse',
    });
  });

  it('ignores a door name that is unusable rather than renaming to nothing', () => {
    expect(
      planSessionBootstrap({ hasToken: true, pendingName: ' A ', currentName: 'Mai' }),
    ).toEqual({ action: 'reuse' });
  });

  it('compares names after normalising, so whitespace alone is not a rename', () => {
    expect(
      planSessionBootstrap({ hasToken: true, pendingName: '  Mai  ', currentName: 'Mai' }),
    ).toEqual({ action: 'reuse' });
  });

  it('still reuses a session whose current name is unknown', () => {
    // If /me could not be read we must not guess that a rename is needed.
    expect(
      planSessionBootstrap({ hasToken: true, pendingName: 'Mai', currentName: null }),
    ).toEqual({ action: 'rename', name: 'Mai' });
  });
});
