import { describe, it, expect } from 'vitest';
import { safeAmount, clampDecimals } from '../src/safe';
import { ValueDisplay, type CurrencySpec } from '../src/controls/ValueDisplay';

const layout = { anchor: 'center' } as const;

describe('never-reject boundary (Charter P11)', () => {
  it('safeAmount keeps the last good value on NaN/Infinity/non-number', () => {
    expect(safeAmount(42, 0)).toBe(42);
    expect(safeAmount(0, 7)).toBe(0); // 0 is a valid value, not "falsy junk"
    expect(safeAmount(NaN, 7)).toBe(7);
    expect(safeAmount(Infinity, 7)).toBe(7);
    expect(safeAmount(-Infinity, 7)).toBe(7);
    expect(safeAmount(null as unknown as number, 7)).toBe(7);
    expect(safeAmount('5' as unknown as number, 7)).toBe(7);
  });

  it('clampDecimals clamps to 0..8 and tolerates junk', () => {
    expect(clampDecimals(2)).toBe(2);
    expect(clampDecimals(-1)).toBe(0);
    expect(clampDecimals(99)).toBe(8);
    expect(clampDecimals(3.9)).toBe(3);
    expect(clampDecimals(NaN)).toBe(2);
  });

  it('ValueDisplay.set never throws and ignores garbage', () => {
    const v = new ValueDisplay({ id: 'balance', layout, currency: { code: 'USD', decimals: 2 }, initial: 100 });
    v.set(250);
    expect(v.get()).toBe(250);
    v.set(NaN);
    expect(v.get()).toBe(250); // kept last good
    v.set(Infinity);
    expect(v.get()).toBe(250);
    v.set(0);
    expect(v.get()).toBe(0); // zero still applies
  });

  it('ValueDisplay.setCurrency keeps the prior spec on malformed input + clamps decimals', () => {
    const v = new ValueDisplay({ id: 'bet', layout, currency: { code: 'USD', decimals: 2 } });
    v.setCurrency({ code: 'BTC', decimals: 99 });
    expect(v.currency.get()).toMatchObject({ code: 'BTC', decimals: 8 });
    v.setCurrency(null as unknown as CurrencySpec);
    expect(v.currency.get().code).toBe('BTC'); // unchanged
  });
});
