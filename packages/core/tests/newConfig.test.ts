import { describe, it, expect } from 'vitest';
import { createUI, resolveTurboModes } from '../src/spec/createUI';
import { validateSpec } from '../src/spec/validateSpec';

describe('createUI — turbo / spin / autoplay config', () => {
  it('resolveTurboModes maps presets and passes arrays through', () => {
    expect(resolveTurboModes(2)).toEqual(['off', 'on']);
    expect(resolveTurboModes(3)).toEqual(['off', 'turbo', 'super']);
    expect(resolveTurboModes(['off', 'fast', 'ludicrous'])).toEqual(['off', 'fast', 'ludicrous']);
    expect(resolveTurboModes(undefined)).toEqual(['off', 'on']);
  });

  it('configures a 3-mode turbo with an initial index', () => {
    const ui = createUI({ turbo: { modes: 3, index: 1 } });
    expect(ui.turbo.modes).toEqual(['off', 'turbo', 'super']);
    expect(ui.turbo.mode).toBe('turbo');
  });

  it("spin.press 'hold-to-spin' arms hold; 'tap' leaves it off", () => {
    expect(createUI({ spin: { press: 'hold-to-spin' } }).spin.holdToSpin).toBe(true);
    expect(createUI({ spin: { press: 'tap' } }).spin.holdToSpin).toBe(false);
    expect(createUI().spin.holdToSpin).toBe(false);
  });

  it('autoplay mode + options apply together', () => {
    const ui = createUI({ autoplay: { mode: 'infinite', options: [5, 10] } });
    expect(ui.autoplay.mode).toBe('infinite');
    expect(ui.autoplay.options).toEqual([5, 10]);
  });
});

describe('validateSpec — new fields (never throws, reports issues)', () => {
  it('accepts valid turbo / spin / autoplay / responsive', () => {
    const { ok, issues } = validateSpec({
      turbo: { modes: 3, index: 2 },
      spin: { press: 'hold-to-spin' },
      autoplay: { mode: 'options', options: [10, Infinity] },
      responsive: { mobile: { controls: { spin: { layout: { anchor: 'bottom-center' } } } } },
    });
    expect(ok).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('flags a bad turbo preset and out-of-range index', () => {
    const { ok, issues } = validateSpec({ turbo: { modes: 5 as 2 | 3, index: 9 } });
    expect(ok).toBe(false);
    expect(issues.map((i) => i.code)).toContain('turbo-bad-count');
    expect(issues.map((i) => i.code)).toContain('index-oor');
  });

  it('flags a too-short turbo ladder and an unknown spin press', () => {
    expect(validateSpec({ turbo: { modes: ['solo'] } }).issues.map((i) => i.code)).toContain('turbo-too-few');
    expect(validateSpec({ spin: { press: 'mash' as 'tap' } }).issues.map((i) => i.code)).toContain('bad-press');
  });

  it('flags an unknown autoplay mode and an unknown responsive bucket', () => {
    expect(validateSpec({ autoplay: { mode: 'turbo' as 'options' } }).issues.map((i) => i.code)).toContain('bad-mode');
    expect(validateSpec({ responsive: { phablet: {} } as never }).issues.map((i) => i.code)).toContain('bad-bucket');
  });
});
