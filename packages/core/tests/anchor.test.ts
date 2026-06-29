import { describe, it, expect } from 'vitest';
import { resolvePlacement, type LayoutSpec } from '../src/layout/anchor';
import { computeScreen, defaultLayoutConfig } from '../src/layout/screen';
import type { ScreenState } from '../src/layout/screen';

const screen: ScreenState = { width: 1920, height: 1080, orientation: 'landscape', scale: 1 };

describe('resolvePlacement', () => {
  it('places each anchor at the expected fraction of the screen', () => {
    expect(resolvePlacement({ anchor: 'top-left' }, screen)).toMatchObject({ x: 0, y: 0 });
    expect(resolvePlacement({ anchor: 'center' }, screen)).toMatchObject({ x: 960, y: 540 });
    expect(resolvePlacement({ anchor: 'bottom-right' }, screen)).toMatchObject({ x: 1920, y: 1080 });
    expect(resolvePlacement({ anchor: 'top-center' }, screen)).toMatchObject({ x: 960, y: 0 });
    expect(resolvePlacement({ anchor: 'center-right' }, screen)).toMatchObject({ x: 1920, y: 540 });
  });

  it('adds the offset, scaled by the screen scale', () => {
    const spec: LayoutSpec = { anchor: 'bottom-center', offset: [0, -440] };
    expect(resolvePlacement(spec, screen)).toMatchObject({ x: 960, y: 640 });
    // at half scale, the offset shrinks with the screen
    const half: ScreenState = { ...screen, scale: 0.5 };
    expect(resolvePlacement(spec, half)).toMatchObject({ x: 960, y: 1080 - 220 });
  });

  it('multiplies the per-control scale on top of the screen fit scale', () => {
    const half: ScreenState = { ...screen, scale: 0.5 };
    expect(resolvePlacement({ anchor: 'center', scale: 2 }, half).scale).toBe(1);
    expect(resolvePlacement({ anchor: 'center' }, half).scale).toBe(0.5);
  });

  it('composes correctly with a real computed screen', () => {
    // a 960x540 viewport against the 1920x1080 reference => 0.5 fit scale
    const s = computeScreen(960, 540, defaultLayoutConfig);
    expect(s.scale).toBe(0.5);
    const p = resolvePlacement({ anchor: 'center', offset: [100, 0] }, s);
    expect(p).toEqual({ x: 480 + 50, y: 270, scale: 0.5, rotation: 0 });
  });

  it('converts layout rotation from degrees to radians (default 0)', () => {
    const s = computeScreen(1920, 1080, defaultLayoutConfig);
    expect(resolvePlacement({ anchor: 'center' }, s).rotation).toBe(0);
    expect(resolvePlacement({ anchor: 'center', rotation: 90 }, s).rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(resolvePlacement({ anchor: 'center', rotation: -45 }, s).rotation).toBeCloseTo(-Math.PI / 4, 6);
  });
});

describe('computeScreen', () => {
  it('picks portrait below the configured aspect and scales to the portrait reference', () => {
    const s = computeScreen(1080, 2337, defaultLayoutConfig);
    expect(s.orientation).toBe('portrait');
    expect(s.scale).toBe(1);
  });

  it('stays landscape at wide aspect ratios', () => {
    const s = computeScreen(1920, 1080, defaultLayoutConfig);
    expect(s.orientation).toBe('landscape');
  });

  it('guards against zero-size viewports', () => {
    const s = computeScreen(0, 0, defaultLayoutConfig);
    expect(s.width).toBe(1);
    expect(s.height).toBe(1);
    expect(Number.isFinite(s.scale)).toBe(true);
  });
});
