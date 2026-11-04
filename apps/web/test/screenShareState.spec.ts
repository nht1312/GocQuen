import type { ScreenShareSessionInfo } from '@virtual-cafe/shared';
import {
  SCREEN_FOCUS_OFF,
  chooseScreenShareFocus,
  classifyScreenShareError,
  deriveScreenShareView,
  isScreenShareSupported,
  needsScreenRoom,
  nextScreenShareFocus,
} from '@/voice/screenShareState';

const SESSION: ScreenShareSessionInfo = {
  id: 'session-1',
  groupId: 'group_a',
  publisherId: 'alice',
  publisherName: 'Alice',
  startedAt: 1_700_000_000_000,
};

function view(over: Partial<Parameters<typeof deriveScreenShareView>[0]> = {}) {
  return deriveScreenShareView({
    session: null,
    selfId: 'alice',
    seated: true,
    local: 'none',
    ...over,
  });
}

describe('deriveScreenShareView — state 1, nothing active', () => {
  it('is idle and offers to start when seated with no session', () => {
    const v = view();
    expect(v.phase).toBe('idle');
    expect(v.canStart).toBe(true);
    expect(v.session).toBeNull();
  });

  it('does not offer to start when standing', () => {
    const v = view({ seated: false });
    expect(v.phase).toBe('idle');
    expect(v.canStart).toBe(false);
    expect(v.message).toMatch(/ngồi/i);
  });
});

describe('deriveScreenShareView — states 2 and 3, getting started', () => {
  it('reports the browser picker being open', () => {
    expect(view({ local: 'selecting' }).phase).toBe('selecting');
  });

  it('reports connecting', () => {
    expect(view({ local: 'connecting' }).phase).toBe('connecting');
  });

  it('lets the server session win once it exists', () => {
    // The picker closed and the server confirmed; stale local intent must not
    // keep the UI on a spinner.
    const v = view({ local: 'connecting', session: SESSION, selfId: 'alice' });
    expect(v.phase).toBe('publishing');
  });
});

describe('deriveScreenShareView — states 4 and 5, active', () => {
  it('reports publishing when the session is mine', () => {
    const v = view({ session: SESSION, selfId: 'alice' });
    expect(v.phase).toBe('publishing');
    expect(v.isPublisher).toBe(true);
    expect(v.canStart).toBe(false);
  });

  it('reports watching when the session belongs to someone else', () => {
    const v = view({ session: SESSION, selfId: 'bob' });
    expect(v.phase).toBe('watching');
    expect(v.isPublisher).toBe(false);
    expect(v.session?.publisherName).toBe('Alice');
  });
});

describe('deriveScreenShareView — state 9, someone else is already sharing', () => {
  it('refuses to start and names who holds the table', () => {
    const v = view({ session: SESSION, selfId: 'bob' });
    expect(v.canStart).toBe(false);
    expect(v.message).toContain('Alice');
  });
});

describe('deriveScreenShareView — states 7, 8 and 10, things going wrong', () => {
  it('reports a denied browser permission and allows another attempt', () => {
    const v = view({ local: 'denied' });
    expect(v.phase).toBe('denied');
    // Denying once must not lock someone out of trying again.
    expect(v.canStart).toBe(true);
    expect(v.message).not.toBeNull();
  });

  it('reports a lost connection', () => {
    const v = view({ local: 'error' });
    expect(v.phase).toBe('error');
    expect(v.message).not.toBeNull();
  });

  it('reports reconnecting even while a session is still on the books', () => {
    // The server still believes Alice is sharing; our own transport is down,
    // and saying "watching" would be a lie about a frozen frame.
    const v = view({ local: 'reconnecting', session: SESSION, selfId: 'bob' });
    expect(v.phase).toBe('reconnecting');
  });
});

describe('deriveScreenShareView — leaving the table', () => {
  it('drops a watcher back to idle the moment they are no longer seated', () => {
    const v = view({ session: SESSION, selfId: 'bob', seated: false });
    expect(v.phase).toBe('idle');
    expect(v.session).toBeNull();
    expect(v.canStart).toBe(false);
  });
});

describe('needsScreenRoom — when to hold a transport', () => {
  it('connects while publishing or watching', () => {
    expect(needsScreenRoom(view({ session: SESSION, selfId: 'alice' }))).toBe(true);
    expect(needsScreenRoom(view({ session: SESSION, selfId: 'bob' }))).toBe(true);
  });

  it('connects while starting up, before the server has confirmed', () => {
    expect(needsScreenRoom(view({ local: 'connecting' }))).toBe(true);
  });

  it('does not connect when nothing is happening', () => {
    expect(needsScreenRoom(view())).toBe(false);
    expect(needsScreenRoom(view({ local: 'selecting' }))).toBe(false);
  });

  it('drops the transport the moment we leave the table', () => {
    // Otherwise a stale subscription keeps feeding a screen we may no longer
    // be entitled to see.
    expect(needsScreenRoom(view({ session: SESSION, selfId: 'bob', seated: false }))).toBe(false);
  });

  it('keeps the transport while reconnecting so it can recover', () => {
    expect(needsScreenRoom(view({ local: 'reconnecting', session: SESSION, selfId: 'bob' }))).toBe(
      true,
    );
  });
});

describe('isScreenShareSupported — spec section 10, unsupported browser', () => {
  it('accepts a browser that offers getDisplayMedia', () => {
    expect(isScreenShareSupported({ getDisplayMedia: () => undefined })).toBe(true);
  });

  it('rejects a browser without it', () => {
    expect(isScreenShareSupported({})).toBe(false);
  });

  it('rejects a context with no media devices at all', () => {
    // Server rendering, and older or locked-down mobile browsers.
    expect(isScreenShareSupported(undefined)).toBe(false);
    expect(isScreenShareSupported(null)).toBe(false);
  });
});

describe('classifyScreenShareError — spec section 10', () => {
  it('treats a refused or cancelled picker as denied, without an alarming toast', () => {
    const error = new DOMException('Permission denied', 'NotAllowedError');
    const result = classifyScreenShareError(error);
    expect(result.local).toBe('denied');
    // Chrome raises NotAllowedError both for a refusal and for simply closing
    // the picker, so the wording has to cover both without accusing anyone.
    expect(result.toast).toBe(false);
  });

  it('treats an aborted picker as a quiet no-op', () => {
    const result = classifyScreenShareError(new DOMException('Aborted', 'AbortError'));
    expect(result.local).toBe('none');
    expect(result.toast).toBe(false);
  });

  it('treats a missing source as a quiet no-op', () => {
    const result = classifyScreenShareError(new DOMException('No source', 'NotFoundError'));
    expect(result.local).toBe('none');
    expect(result.toast).toBe(false);
  });

  it('reports a transport failure loudly, because the user can retry', () => {
    const result = classifyScreenShareError(new Error('could not connect to room'));
    expect(result.local).toBe('error');
    expect(result.toast).toBe(true);
    expect(result.message).not.toBe('');
  });

  it('has a message for something it does not recognise', () => {
    const result = classifyScreenShareError('what even is this');
    expect(result.local).toBe('error');
    expect(result.message).not.toBe('');
  });
});

describe('nextScreenShareFocus — a live screen takes the interface over', () => {
  it('takes over as soon as my own share goes live', () => {
    expect(nextScreenShareFocus(SCREEN_FOCUS_OFF, 'publishing')).toEqual({
      focused: true,
      chosen: false,
    });
  });

  it('takes over for everyone who joins to watch', () => {
    expect(nextScreenShareFocus(SCREEN_FOCUS_OFF, 'watching')).toEqual({
      focused: true,
      chosen: false,
    });
  });

  it('leaves a deliberate return to the café alone', () => {
    // Someone who pressed "Quay lại quán" meant it. Re-expanding on the next
    // render would take the room away from them again.
    const chosen = chooseScreenShareFocus(false);
    expect(nextScreenShareFocus(chosen, 'watching')).toBe(chosen);
  });

  it('keeps a deliberate expansion', () => {
    const chosen = chooseScreenShareFocus(true);
    expect(nextScreenShareFocus(chosen, 'publishing')).toBe(chosen);
  });

  it('holds the current layout while connecting or reconnecting', () => {
    // Collapsing on a blip and expanding again on recovery would flash the
    // café in and out for no reason.
    const expanded = { focused: true, chosen: false };
    expect(nextScreenShareFocus(expanded, 'reconnecting')).toBe(expanded);
    expect(nextScreenShareFocus(SCREEN_FOCUS_OFF, 'connecting')).toBe(SCREEN_FOCUS_OFF);
  });

  it('gives the café back when the share ends, and forgets the override', () => {
    // The next share at this table must take over again on its own merits.
    expect(nextScreenShareFocus(chooseScreenShareFocus(false), 'idle')).toEqual(SCREEN_FOCUS_OFF);
    expect(nextScreenShareFocus({ focused: true, chosen: false }, 'idle')).toEqual(SCREEN_FOCUS_OFF);
  });

  it('gives the café back when the screen is lost or refused', () => {
    expect(nextScreenShareFocus({ focused: true, chosen: false }, 'error')).toEqual(
      SCREEN_FOCUS_OFF,
    );
    expect(nextScreenShareFocus({ focused: true, chosen: false }, 'denied')).toEqual(
      SCREEN_FOCUS_OFF,
    );
  });

  it('returns the same object when nothing changes', () => {
    // The store compares by identity; a fresh object on every phase tick
    // would re-render the whole café for no change.
    expect(nextScreenShareFocus(SCREEN_FOCUS_OFF, 'idle')).toBe(SCREEN_FOCUS_OFF);
  });
});
