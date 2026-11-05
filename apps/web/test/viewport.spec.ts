import { MIN_WORLD_SCALE, sceneExtent, worldScaleFor } from '@/game/viewport';

/**
 * The zoom only exists for small screens. A regression that let it fire on a
 * laptop would shrink the café for every desktop visitor at once, so the
 * desktop cases are pinned as firmly as the phone ones.
 */
describe('worldScaleFor — screens with room for the café', () => {
  it('leaves a laptop window alone', () => {
    expect(worldScaleFor(1440, 900)).toBe(1);
  });

  it('leaves a tablet held upright alone', () => {
    expect(worldScaleFor(820, 1180)).toBe(1);
  });

  it('leaves the narrowest unzoomed viewport alone', () => {
    expect(worldScaleFor(640, 560)).toBe(1);
  });
});

describe('worldScaleFor — screens that would see a sliver', () => {
  it('zooms out on a phone held upright', () => {
    expect(worldScaleFor(390, 844)).toBeLessThan(1);
  });

  it('zooms out on a phone held sideways, where height is the constraint', () => {
    expect(worldScaleFor(844, 390)).toBeLessThan(1);
  });

  it('never zooms out past the point where the furniture stops reading', () => {
    expect(worldScaleFor(280, 480)).toBe(MIN_WORLD_SCALE);
    expect(worldScaleFor(120, 160)).toBe(MIN_WORLD_SCALE);
  });

  it('shows more of the room than the viewport is wide', () => {
    // The whole point: 390 CSS pixels of glass must frame more than 390
    // pixels of café, or the zoom has bought nothing.
    const scale = worldScaleFor(390, 844);
    expect(390 / scale).toBeGreaterThan(430);
  });
});

describe('worldScaleFor — not zooming out past the room itself', () => {
  const scene = sceneExtent();

  it('frames a tall phone to the room, with no empty bands above and below', () => {
    // The room runs out of height long before it runs out of width, and any
    // zoom past that pads the picture with background instead of café.
    const scale = worldScaleFor(390, 844);
    expect(844 / scale).toBeLessThanOrEqual(scene.height + 1);
  });

  it('still fills a short landscape phone, where width is the scarce axis', () => {
    const scale = worldScaleFor(844, 390);
    expect(390 / scale).toBeLessThanOrEqual(scene.height + 1);
    expect(844 / scale).toBeLessThan(scene.width);
  });

  it('keeps the legibility floor even when the room would allow more', () => {
    // A very short window could frame the whole room at a tiny zoom; the
    // furniture would be unreadable, so the floor wins.
    expect(worldScaleFor(320, 300)).toBe(MIN_WORLD_SCALE);
  });
});

describe('worldScaleFor — viewports that have not been measured yet', () => {
  it('stays at 1 before the canvas has a size', () => {
    expect(worldScaleFor(0, 0)).toBe(1);
    expect(worldScaleFor(-10, 500)).toBe(1);
    expect(worldScaleFor(Number.NaN, Number.NaN)).toBe(1);
  });
});
