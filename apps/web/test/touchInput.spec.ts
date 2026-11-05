import { vectorToDirection } from '@virtual-cafe/shared';
import { joystickToWorld } from '@/game/touchInput';

/**
 * The joystick is the only way to walk on a phone, and it is aimed at the
 * screen while the avatar moves through world coordinates. Getting that
 * mapping wrong is invisible in code review and obvious on a device, so it is
 * pinned here against the facings the renderer draws.
 */
describe('joystickToWorld — pushing the stick at the screen', () => {
  const facing = (x: number, y: number) => {
    const { dx, dy } = joystickToWorld({ x, y });
    return vectorToDirection(dx, dy);
  };

  it('walks towards the back of the room when pushed up', () => {
    expect(facing(0, -1)).toBe('north');
  });

  it('walks towards the camera when pushed down', () => {
    expect(facing(0, 1)).toBe('south');
  });

  it('walks to the screen-left wall when pushed left', () => {
    expect(facing(-1, 0)).toBe('west');
  });

  it('walks to the screen-right wall when pushed right', () => {
    expect(facing(1, 0)).toBe('east');
  });

  it('follows the diagonals the floor tiles run along', () => {
    expect(facing(1, 1)).toBe('south_east');
    expect(facing(-1, 1)).toBe('south_west');
    expect(facing(1, -1)).toBe('north_east');
    expect(facing(-1, -1)).toBe('north_west');
  });

  it('agrees with the keyboard: screen right is world +x, -y', () => {
    const { dx, dy } = joystickToWorld({ x: 1, y: 0 });
    expect(dx).toBeCloseTo(Math.SQRT1_2);
    expect(dy).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe('joystickToWorld — how hard the stick is pushed', () => {
  const speed = (x: number, y: number) => {
    const { dx, dy } = joystickToWorld({ x, y });
    return Math.hypot(dx, dy);
  };

  it('walks at full speed at the rim', () => {
    expect(speed(1, 0)).toBeCloseTo(1);
    expect(speed(0, -1)).toBeCloseTo(1);
  });

  it('walks at half speed halfway out, so a thumb can edge up to a chair', () => {
    expect(speed(0.5, 0)).toBeCloseTo(0.5);
    expect(speed(0, 0.5)).toBeCloseTo(0.5);
  });

  it('never walks faster than the keyboard, however far past the rim it is read', () => {
    expect(speed(3, 3)).toBeCloseTo(1);
  });

  it('measures the push as distance, not per axis', () => {
    // A diagonal at half deflection on both axes is further out than half.
    expect(speed(0.5, 0.5)).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('joystickToWorld — a thumb that is not asking to move', () => {
  it('stands still with no stick at all', () => {
    expect(joystickToWorld(null)).toEqual({ dx: 0, dy: 0 });
    expect(joystickToWorld(undefined)).toEqual({ dx: 0, dy: 0 });
  });

  it('stands still at dead centre rather than dividing by zero', () => {
    expect(joystickToWorld({ x: 0, y: 0 })).toEqual({ dx: 0, dy: 0 });
  });
});
