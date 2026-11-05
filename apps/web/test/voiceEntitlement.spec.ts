import { voiceConnectionOutlivedSeat, voiceGroupOfSeat } from '@/voice/voiceEntitlement';

/**
 * The reported bug: sit at a table, join the conversation, stand up — and you
 * can still hear it. The server had already dropped the membership; what kept
 * the audio flowing was the SFU room, which only the client can close.
 *
 * These pin the rule that decides when it closes.
 */
describe('voiceConnectionOutlivedSeat — standing up', () => {
  it('drops the room when the seat is given up', () => {
    expect(voiceConnectionOutlivedSeat('window_1', null)).toBe(true);
  });

  it('keeps the room while the seat that justified it is still held', () => {
    expect(voiceConnectionOutlivedSeat('window_1', 'window_1:1')).toBe(false);
  });

  it('keeps it for any chair at the same table, not just the one joined from', () => {
    // The entitlement is the table, so shuffling seats within it is not
    // leaving the conversation.
    expect(voiceConnectionOutlivedSeat('window_1', 'window_1:2')).toBe(false);
  });
});

describe('voiceConnectionOutlivedSeat — moving to another table', () => {
  it('drops the room when the new seat belongs to another table', () => {
    // Tapping another table's chair never passes through "standing", so a
    // rule written only around the stand button would miss this entirely.
    expect(voiceConnectionOutlivedSeat('window_1', 'window_2:1')).toBe(true);
  });

  it('drops the room when moving to the counter', () => {
    expect(voiceConnectionOutlivedSeat('window_1', 'counter:1')).toBe(true);
  });
});

describe('voiceConnectionOutlivedSeat — when there is nothing open', () => {
  it('has nothing to drop with no room connected', () => {
    expect(voiceConnectionOutlivedSeat(null, null)).toBe(false);
    expect(voiceConnectionOutlivedSeat(null, 'window_1:1')).toBe(false);
  });

  it('drops a room whose seat is no longer a seat at all', () => {
    // A seat id the map does not know cannot entitle anyone to anything.
    expect(voiceConnectionOutlivedSeat('window_1', 'no_such_seat:1')).toBe(true);
  });
});

describe('voiceGroupOfSeat', () => {
  it('reads the table from the seat', () => {
    expect(voiceGroupOfSeat('window_1:1')).toBe('window_1');
    expect(voiceGroupOfSeat('counter:2')).toBe('counter');
  });

  it('is null while standing', () => {
    expect(voiceGroupOfSeat(null)).toBeNull();
    expect(voiceGroupOfSeat(undefined)).toBeNull();
    expect(voiceGroupOfSeat('')).toBeNull();
  });

  it('is null for a seat the map does not know', () => {
    expect(voiceGroupOfSeat('no_such_seat:1')).toBeNull();
  });
});
