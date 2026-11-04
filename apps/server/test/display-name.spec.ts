import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  normaliseDisplayName,
} from '@virtual-cafe/shared';
import { SessionService } from '../src/auth/session.service';

describe('normaliseDisplayName', () => {
  it('accepts an ordinary name unchanged', () => {
    expect(normaliseDisplayName('Hoài Tú')).toBe('Hoài Tú');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseDisplayName('  Mai  ')).toBe('Mai');
  });

  it('rejects a name that is only whitespace', () => {
    expect(normaliseDisplayName('   ')).toBeNull();
  });

  it('rejects nothing at all', () => {
    expect(normaliseDisplayName('')).toBeNull();
    expect(normaliseDisplayName(undefined)).toBeNull();
    expect(normaliseDisplayName(null)).toBeNull();
  });

  it(`rejects a name shorter than ${DISPLAY_NAME_MIN} characters`, () => {
    expect(normaliseDisplayName('A')).toBeNull();
  });

  it(`truncates rather than rejects a name longer than ${DISPLAY_NAME_MAX}`, () => {
    const long = 'B'.repeat(DISPLAY_NAME_MAX + 20);
    expect(normaliseDisplayName(long)).toHaveLength(DISPLAY_NAME_MAX);
  });

  it('strips control characters so a name cannot smuggle formatting', () => {
    // Zero-width and directional marks can be used to impersonate another
    // guest's name plate or break the layout around it.
    expect(normaliseDisplayName('Ma​i‮')).toBe('Mai');
  });

  it('rejects a name that is only control characters', () => {
    expect(normaliseDisplayName('​​​')).toBeNull();
  });

  it('keeps Vietnamese diacritics intact', () => {
    expect(normaliseDisplayName('Nguyễn Thị Ánh')).toBe('Nguyễn Thị Ánh');
  });
});

describe('SessionService.sanitiseName', () => {
  it('applies exactly the shared rule, so client and server cannot disagree', () => {
    for (const input of ['  Mai  ', 'A', '', 'C'.repeat(40), 'Ma​i', 'Nguyễn Thị Ánh']) {
      expect(SessionService.sanitiseName(input)).toEqual(normaliseDisplayName(input));
    }
  });
});
