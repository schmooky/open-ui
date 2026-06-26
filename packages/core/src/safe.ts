/**
 * Never-reject inbound boundary helpers (Charter P11). The UI *displays* values
 * the host sets and computes no money — so malformed host data must degrade to a
 * no-op, never throw into the render loop.
 */

/** Return `n` if it is a finite number, else fall back to the last good value. */
export function safeAmount(n: number, lastGood: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : lastGood;
}

/** Clamp a currency's fractional digits to a sane 0..8 integer (default 2). */
export function clampDecimals(d: number): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return 2;
  return Math.max(0, Math.min(8, Math.trunc(d)));
}

/** Clamp the value counter's fit WIDTH budget to a sane 1..18 column count (default 9). */
export function clampDigits(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 9;
  return Math.max(1, Math.min(18, Math.trunc(n)));
}

/** Clamp a value-display's MINIMUM column width: 0..18, where 0 means "auto" — size
 *  the odometer tightly to the value. Garbage → 0 (auto). */
export function clampMinDigits(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(18, Math.trunc(n)));
}

/** How many integer (whole-part) digits a value needs, minimum 1 (so `0.x` shows a
 *  leading `0`). Uses string length, not log10, to dodge the `log10(1000)=2.999…` trap. */
export function integerDigits(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return String(Math.floor(Math.abs(value))).length;
}

/**
 * Total odometer columns to show `value` at `decimals` precision TIGHTLY — exactly
 * the integer digits the value needs plus the fraction columns, so there are no
 * hidden leading-zero columns padding the number (a fixed reserve would either gap
 * small values like `$1.00` or clamp large ones like `12.34 BTC` on a 9-col budget).
 * Never below `minTotal` (a host-set stable width) nor `decimals + 1` (the counter
 * needs `decimals < digits`); capped at 18. The renderer grows the counter as the
 * value grows, so the magnitude is never clamped.
 */
export function displayDigits(value: number, minTotal: number, decimals: number): number {
  const d = clampDecimals(decimals);
  const min = clampMinDigits(minTotal);
  return Math.min(18, Math.max(min, integerDigits(value) + d, d + 1));
}

/**
 * On-screen width budget (px) the value counter is allowed before `fit` scales it
 * down. Keyed to a fixed display budget (≥ 9 columns, or the host's wider `digits`)
 * so a normal-magnitude readout renders full-size while a very large value scales to
 * fit ("won't go too far"). `+64` leaves room for the currency affix.
 */
export function valueFitMaxWidth(digits: number, columnWidth: number): number {
  return clampDigits(digits) * columnWidth + 64;
}
