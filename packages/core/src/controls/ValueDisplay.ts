import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { safeAmount, clampDecimals } from '../safe';
import type { LayoutSpec } from '../layout/anchor';

/** Currency / crypto descriptor — just the code + how to format it. */
export interface CurrencySpec {
  /** ISO code or crypto name shown next to the number: "USD", "EUR", "BTC", "ETH". */
  code: string;
  /** Fractional digits: 2 (USD), 0 (JPY), 8 (BTC). Values stay integer minor-units. */
  decimals: number;
  /** Code on the left or right of the number. Default 'suffix'. */
  position?: 'prefix' | 'suffix';
  /** Thousands separator char. Default ','. */
  separator?: string;
  /** Decimal point char. Default '.'. */
  decimalChar?: string;
}

export interface ValueDisplayOptions {
  id: string;
  layout: LayoutSpec;
  currency: CurrencySpec;
  /** Optional caption ("Balance" / "Bet"). */
  label?: string;
  /** Initial value, in major units (e.g. 1234.56). */
  initial?: number;
  /** Total digit columns (integer + decimal). Default 9. */
  digits?: number;
}

/**
 * A value display: a number plus a currency/crypto code. Not interactive — the
 * host sets the value (`ui.balance.set(...)`) and the renderer animates it.
 * Value is held in major units; `minorUnits` is the integer the counter rolls.
 */
export class ValueDisplay extends Control {
  readonly states: StateMap = { idle: { interactable: false } };
  readonly value = new Signal<number>(0);
  readonly currency: Signal<CurrencySpec>;
  readonly label?: string;
  readonly digits: number;

  constructor(opts: ValueDisplayOptions) {
    super({ id: opts.id, role: 'status', layout: opts.layout }, 'idle');
    this.currency = new Signal<CurrencySpec>(opts.currency);
    this.label = opts.label;
    this.digits = opts.digits ?? 9;
    if (opts.initial != null) this.value.set(opts.initial);
  }

  /** Never-reject: NaN/Infinity/non-number degrade to a no-op, keeping the last
   *  good value — malformed host data never throws into the render loop (P11). */
  set(amount: number): void {
    this.value.set(safeAmount(amount, this.value.get()));
  }

  get(): number {
    return this.value.get();
  }

  /** Keep the prior spec on malformed input; clamp decimals to 0..8 (P11). */
  setCurrency(spec: CurrencySpec): void {
    if (!spec || typeof spec.code !== 'string') return;
    this.currency.set({ ...spec, decimals: clampDecimals(spec.decimals) });
  }

  /** Integer minor units for the counter (no float drift). */
  get minorUnits(): number {
    return Math.round(this.value.get() * Math.pow(10, this.currency.get().decimals));
  }
}
