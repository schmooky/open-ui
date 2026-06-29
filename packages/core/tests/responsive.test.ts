import { describe, it, expect, vi } from 'vitest';
import { createUI } from '../src/spec/createUI';
import type { UISpec } from '../src/spec/types';

// Default breakpoints (short edge): mobile <= 480, tablet <= 840, else desktop.
const DESKTOP = [1920, 1080] as const; // short 1080 → desktop, landscape
const MOBILE = [390, 844] as const; //    short 390  → mobile,  portrait
const TABLET = [820, 1180] as const; //   short 820  → tablet,  portrait

const spec: UISpec = {
  // The buy button is hidden by default; this spec reveals it so the responsive
  // mobile override can then hide it (exercising base→bucket→restore).
  controls: { bonus: { hidden: false } },
  responsive: {
    portrait: { controls: { spin: { layout: { anchor: 'bottom-center', offset: [0, -300] } } } },
    mobile: {
      controls: {
        spin: { layout: { anchor: 'bottom-center', offset: [0, -200] } },
        bonus: { hidden: true },
      },
    },
  },
};

describe('responsive overrides (per device / orientation)', () => {
  it('starts at the base layout on desktop', () => {
    const ui = createUI(spec);
    expect(ui.screen.get().breakpoint).toBe('desktop');
    expect(ui.spin.layout.offset).toEqual([0, -440]); // reference default, untouched
    expect(ui.hidden.has('bonus')).toBe(false);
  });

  it('size bucket wins over orientation, and hides controls, on mobile portrait', () => {
    const ui = createUI(spec);
    ui.setScreen(...MOBILE);
    expect(ui.screen.get().breakpoint).toBe('mobile');
    expect(ui.screen.get().orientation).toBe('portrait');
    expect(ui.spin.layout.offset).toEqual([0, -200]); // mobile overrides portrait
    expect(ui.hidden.has('bonus')).toBe(true);
  });

  it('applies orientation when no size bucket matches (tablet portrait)', () => {
    const ui = createUI(spec);
    ui.setScreen(...TABLET);
    expect(ui.screen.get().breakpoint).toBe('tablet');
    expect(ui.spin.layout.offset).toEqual([0, -300]); // portrait only
    expect(ui.hidden.has('bonus')).toBe(false); // only mobile hides it
  });

  it('restores the base when leaving a bucket, emitting visibilityChanged', () => {
    const ui = createUI(spec);
    const seen = vi.fn();
    ui.on('visibilityChanged', seen);
    ui.setScreen(...MOBILE);
    expect(ui.hidden.has('bonus')).toBe(true);
    expect(seen).toHaveBeenCalledWith({ id: 'bonus', hidden: true });
    ui.setScreen(...DESKTOP);
    expect(ui.spin.layout.offset).toEqual([0, -440]); // base restored
    expect(ui.hidden.has('bonus')).toBe(false);
    expect(seen).toHaveBeenCalledWith({ id: 'bonus', hidden: false });
  });
});
