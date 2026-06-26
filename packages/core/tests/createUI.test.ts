import { describe, it, expect, vi } from 'vitest';
import { createUI, defineUI } from '../src/spec/createUI';
import { OpenUI } from '../src/OpenUI';
import { defaultHudSpec } from '../src/spec/defaultHudSpec';

describe('createUI (Charter B9, P6, P11)', () => {
  it('zero-arg builds the reference HUD (same controls as new OpenUI)', () => {
    const a = createUI();
    const b = new OpenUI();
    expect(a).toBeInstanceOf(OpenUI);
    expect(a.all().map((c) => c.id).sort()).toEqual(b.all().map((c) => c.id).sort());
  });

  it('defaultHudSpec reproduces the zero-arg defaults', () => {
    const a = createUI();
    const b = createUI(defaultHudSpec);
    expect(b.snapshot().map((s) => s.id)).toEqual(a.snapshot().map((s) => s.id));
    expect(b.betStepper.value).toBe(a.betStepper.value);
  });

  it('applies a theme preset + overrides', () => {
    const ui = createUI({ theme: { preset: 'default', overrides: { color: { accent: '#abc123' } } } });
    expect(ui.theme.color.accent).toBe('#abc123');
    expect(ui.theme.color.text).toBe('#ffffff'); // default base preserved
  });

  it('applies currency, bet ladder and autoplay options', () => {
    const ui = createUI({
      currency: { code: 'BTC', decimals: 8 },
      betLadder: { levels: [0.2, 0.5, 1], index: 2 },
      autoplay: { options: [7, 13, Infinity] },
    });
    expect(ui.balance.currency.get().code).toBe('BTC');
    expect(ui.bet.currency.get().code).toBe('BTC');
    expect(ui.betStepper.value).toBe(1);
    expect(ui.bet.get()).toBe(1);
    expect(ui.autoplay.options).toEqual([7, 13, Infinity]);
  });

  it('applies per-control overrides: hidden, disabled, layout', () => {
    const ui = createUI({
      controls: {
        bonus: { hidden: true },
        turbo: { disabled: true },
        spin: { layout: { anchor: 'top-right', offset: [0, 0] } },
      },
    });
    expect(ui.hidden.has('bonus')).toBe(true);
    expect(ui.control('bonus')).toBeDefined(); // still registered → introspectable
    expect(ui.turbo.current).toBe('disabled');
    expect(ui.spin.layout.anchor).toBe('top-right');
  });

  it('forwards validation issues to the host but still boots (degrade, never crash)', () => {
    const onDataIssue = vi.fn();
    const ui = createUI({ betLadder: { levels: [] } }, { onDataIssue });
    expect(onDataIssue).toHaveBeenCalled();
    expect(ui).toBeInstanceOf(OpenUI);
  });

  it('auto-locks the whole HUD while spinning, releases when idle (P6/G7)', () => {
    const ui = createUI();
    expect(ui.locked.get()).toBe(false);
    ui.spin.busy();
    expect(ui.locked.get()).toBe(true);
    expect(ui.betPlus.interactable).toBe(false);
    ui.spin.idle();
    expect(ui.locked.get()).toBe(false);
    expect(ui.betPlus.interactable).toBe(true);
  });

  it('lockDuringSpin:false disables the auto-lock', () => {
    const ui = createUI({ lockDuringSpin: false });
    ui.spin.busy();
    expect(ui.locked.get()).toBe(false);
  });

  it('freezes the spec onto ui.spec; defineUI is an identity helper', () => {
    const spec = defineUI({ currency: { code: 'USD', decimals: 2 } });
    const ui = createUI(spec);
    expect(ui.spec).toBeDefined();
    expect(Object.isFrozen(ui.spec)).toBe(true);
    const raw = { currency: { code: 'USD', decimals: 2 } };
    expect(defineUI(raw)).toBe(raw);
  });
});
