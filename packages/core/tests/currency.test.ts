import { describe, it, expect } from 'vitest';
import { ValueDisplay, type CurrencySpec } from '../src/controls/ValueDisplay';
import { displayDigits, integerDigits, clampMinDigits, clampDigits, valueFitMaxWidth } from '../src/safe';
import { createUI } from '../src/spec/createUI';
import { validateSpec } from '../src/spec/validateSpec';

const layout = { anchor: 'center' } as const;
const vd = (currency: CurrencySpec, initial = 0): ValueDisplay =>
  new ValueDisplay({ id: 'balance', layout, currency, initial });

describe('currency display / minimal unit', () => {
  it('decimals set the fractional precision; minorUnits is the integer the counter rolls', () => {
    expect(vd({ code: 'USD', decimals: 2 }, 12.34).minorUnits).toBe(1234);
    expect(vd({ code: 'SATS', decimals: 0 }, 123456789).minorUnits).toBe(123456789);
    expect(vd({ code: 'mBTC', decimals: 5 }, 1234.56789).minorUnits).toBe(123456789);
    expect(vd({ code: 'BTC', decimals: 8 }, 1.23456789).minorUnits).toBe(123456789);
  });

  it('rounds to the minimal unit without float drift', () => {
    expect(vd({ code: 'USD', decimals: 2 }, 0.1 + 0.2).minorUnits).toBe(30); // 0.30, not 0.30000000004
    expect(vd({ code: 'JPY', decimals: 0 }, 1999.9).minorUnits).toBe(2000);
  });

  it('setCurrency preserves symbol + display and clamps decimals to 0..8', () => {
    const v = vd({ code: 'USD', decimals: 2 });
    v.setCurrency({ code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix', decimals: 99 });
    const c = v.currency.get();
    expect(c).toMatchObject({ code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix' });
    expect(c.decimals).toBe(8); // clamped from 99
  });

  it('keeps the prior spec on malformed currency (never-reject, P11)', () => {
    const v = vd({ code: 'USD', symbol: '$', display: 'symbol', decimals: 2 });
    v.setCurrency(null as unknown as CurrencySpec);
    expect(v.currency.get().code).toBe('USD');
    expect(v.currency.get().symbol).toBe('$');
  });

  it('clamps decimals at construction too (not just setCurrency)', () => {
    // 8-decimal cap protects the counter (decimals must be < total digits) and minorUnits.
    expect(vd({ code: 'BTC', decimals: 99 }).currency.get().decimals).toBe(8);
    expect(vd({ code: 'X', decimals: -3 }).currency.get().decimals).toBe(0);
  });
});

describe('integerDigits — whole-part digit count', () => {
  it('counts integer digits (min 1), robust at powers of ten', () => {
    expect(integerDigits(1.23)).toBe(1);
    expect(integerDigits(0.5)).toBe(1); // leading 0
    expect(integerDigits(0)).toBe(1);
    expect(integerDigits(12.34)).toBe(2);
    expect(integerDigits(1000)).toBe(4); // not 3 — the log10(1000)=2.999… trap
    expect(integerDigits(123456789)).toBe(9);
    expect(integerDigits(-50.5)).toBe(2); // magnitude
    expect(integerDigits(NaN)).toBe(1);
    expect(integerDigits(Infinity)).toBe(1);
  });
});

describe('displayDigits — TIGHT odometer sizing (no reserve gap, no clamp)', () => {
  // total columns = exactly the value's integer digits + the fraction columns, so the
  // symbol hugs the number; grows with the value so it never clamps; ≥ minTotal and > decimals.
  it('sizes tightly to the value across the named currencies', () => {
    expect(displayDigits(1.23456789, 0, 8)).toBe(9); // BTC: 1 int + 8 frac — symbol hugs
    expect(displayDigits(12.34, 0, 8)).toBe(10); // BTC ≥ 10 grows, no clamp
    expect(displayDigits(1, 0, 2)).toBe(3); // USD $1.00 — tight, NOT padded to 9
    expect(displayDigits(12345.67, 0, 2)).toBe(7); // USD
    expect(displayDigits(123456789, 0, 0)).toBe(9); // SATS
    expect(displayDigits(1234.56789, 0, 5)).toBe(9); // mBTC
  });

  it('grows to fit a whale balance WITHOUT any override (dynamic, never clamps)', () => {
    const total = displayDigits(1_000_000.12345678, 0, 8);
    expect(total).toBe(15); // 7 int + 8 frac
    const minor = Math.round(1_000_000.12345678 * 1e8);
    expect(minor).toBeLessThanOrEqual(Math.pow(10, total) - 1); // representable, no clamp
    // a flat 9-column odometer (the old fixed default) could NOT have held it
    expect(minor).toBeGreaterThan(Math.pow(10, 9) - 1);
  });

  it('shrinks across a power-of-ten boundary (so the view re-sizes down, not just up)', () => {
    // proves a descent crosses a digit-count boundary → the view rebuilds smaller.
    expect(displayDigits(12.34, 0, 8)).toBeGreaterThan(displayDigits(1, 0, 8)); // 10 > 9
    expect(displayDigits(1000, 0, 2)).toBeGreaterThan(displayDigits(1, 0, 2)); // 6 > 3
    expect(displayDigits(123456789, 0, 0)).toBeGreaterThan(displayDigits(9, 0, 0)); // 9 > 1
  });

  it('honours a host minimum width and the decimals invariant, capped at 18', () => {
    expect(displayDigits(1.23, 16, 8)).toBe(16); // min-width override wins
    expect(displayDigits(0, 0, 8)).toBe(9); // ≥ decimals + 1
    expect(displayDigits(1e20, 0, 8)).toBe(18); // capped
  });

  it('keeps decimals strictly below the total column count (counter invariant)', () => {
    for (let d = 0; d <= 8; d++) expect(displayDigits(0, 0, d)).toBeGreaterThan(d);
  });
});

describe('clampMinDigits — value-display minimum width (0 = auto)', () => {
  it('clamps to 0..18, where 0/garbage means auto', () => {
    expect(clampMinDigits(0)).toBe(0); // auto
    expect(clampMinDigits(16)).toBe(16);
    expect(clampMinDigits(99)).toBe(18); // capped
    expect(clampMinDigits(-5)).toBe(0); // auto
    expect(clampMinDigits(9.8)).toBe(9); // truncated
    expect(clampMinDigits(NaN)).toBe(0);
    expect(clampMinDigits(Infinity)).toBe(0);
    expect(clampMinDigits('16' as unknown as number)).toBe(0);
  });
});

describe('valueFitMaxWidth — the fixed fit px budget', () => {
  it('scales the px budget with the column count (+64 affix room)', () => {
    expect(valueFitMaxWidth(9, 26)).toBe(298);
    expect(valueFitMaxWidth(16, 26)).toBe(480);
  });
  it('floors at 1 column and defaults a garbage budget (clampDigits 1..18)', () => {
    expect(valueFitMaxWidth(12, 26)).toBeGreaterThan(valueFitMaxWidth(9, 26));
    expect(valueFitMaxWidth(Infinity, 26)).toBe(valueFitMaxWidth(9, 26)); // non-finite → 9
    expect(clampDigits(0)).toBe(1); // never a zero-width budget
  });
});

describe('digits override — optional minimum width (auto by default)', () => {
  it('the default is auto (0): the odometer sizes itself to the value', () => {
    expect(createUI().balance.digits).toBe(0);
    expect(createUI().bet.digits).toBe(0);
    expect(new ValueDisplay({ id: 'balance', layout, currency: { code: 'USD', decimals: 2 } }).digits).toBe(0);
  });

  it('setDigits clamps directly to 0..18 (0 = auto), not just via the constructor', () => {
    const v = vd({ code: 'BTC', decimals: 8 });
    v.setDigits(16);
    expect(v.digits).toBe(16);
    v.setDigits(99);
    expect(v.digits).toBe(18); // capped
    v.setDigits(-5);
    expect(v.digits).toBe(0); // → auto
    v.setDigits(9.8);
    expect(v.digits).toBe(9); // truncated
    v.setDigits(NaN);
    expect(v.digits).toBe(0); // → auto
  });

  it('a host can set a minimum width via the spec; clamped at the boundary', () => {
    const ui = createUI({
      currency: { code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix', decimals: 8 },
      controls: { balance: { digits: 16 }, bet: { digits: 99 } },
    });
    expect(ui.balance.digits).toBe(16);
    expect(ui.bet.digits).toBe(18); // 99 clamped to 18
  });

  it('a digits override on a non-value control (rtp / net-position ReadoutControl) is ignored, never throws', () => {
    let ui!: ReturnType<typeof createUI>;
    expect(() => {
      ui = createUI({ controls: { rtp: { digits: 16 }, 'net-position': { digits: 16 } } });
    }).not.toThrow(); // P11: a misplaced override must not break boot
    expect((ui.rtp as unknown as { digits?: number }).digits).toBeUndefined();
    expect((ui.netPosition as unknown as { digits?: number }).digits).toBeUndefined();
  });

  it('validateSpec: 0 is valid (auto), out-of-range warns, non-number errors (never-throw)', () => {
    expect(validateSpec({ controls: { balance: { digits: 0 } } }).issues.some((i) => i.code === 'digits-range')).toBe(false); // 0 = auto, fine

    const big = validateSpec({ controls: { balance: { digits: 99 } } });
    expect(big.ok).toBe(true); // warn, not error — still boots
    expect(big.issues.some((i) => i.code === 'digits-range' && i.level === 'warn')).toBe(true);
    expect(validateSpec({ controls: { balance: { digits: -1 } } }).issues.some((i) => i.code === 'digits-range')).toBe(true);

    // Infinity/NaN are NUMBERS that fail Number.isFinite → the 'bad-digits' error branch.
    for (const d of [Infinity, NaN, -Infinity]) {
      const r = validateSpec({ controls: { balance: { digits: d } } });
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.code === 'bad-digits' && i.level === 'error')).toBe(true);
    }
    // …and createUI still boots on the non-finite value (clamps to auto = 0).
    expect(createUI({ controls: { balance: { digits: Infinity } } }).balance.digits).toBe(0);

    const bad = validateSpec({ controls: { balance: { digits: 'x' as unknown as number } } });
    expect(bad.ok).toBe(false); // non-number is an error
    expect(bad.issues.some((i) => i.code === 'bad-digits' && i.level === 'error')).toBe(true);
  });
});
