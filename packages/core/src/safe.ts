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
