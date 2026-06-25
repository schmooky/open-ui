/**
 * Build / clamp a bet ladder from a Stake Engine RGS bet config so the host doesn't
 * have to hand-tune `betLadder` (and can't ship a stake outside min/max/step). Pure.
 */

export interface RgsBetConfig {
  /** Allowed stake amounts in API minor units (Stake: dollars × 1_000_000). */
  betLevels?: number[];
  minBet?: number;
  maxBet?: number;
  stepBet?: number;
  /** Default stake in minor units (custom bets must be a multiple of this). */
  defaultBetLevel?: number;
}

/** Stake's API minor-unit divisor (1_000_000 minor units = 1.00). */
export const API_AMOUNT_DIVISOR = 1_000_000;

/**
 * Turn an RGS bet config into a `{ levels, index }` ladder in MAJOR units (what
 * `UISpec.betLadder` wants). Uses `betLevels` if present, else derives from
 * min/max/step. `divisor` converts minor→major (default Stake's 1_000_000).
 */
export function buildBetLadder(cfg: RgsBetConfig, divisor = API_AMOUNT_DIVISOR): { levels: number[]; index: number } {
  let minor: number[];
  if (cfg.betLevels?.length) {
    minor = cfg.betLevels.slice();
  } else {
    const min = cfg.minBet ?? 0;
    const max = Math.max(min, cfg.maxBet ?? min);
    const step = cfg.stepBet && cfg.stepBet > 0 ? cfg.stepBet : max - min || 1;
    minor = [];
    for (let v = min; v <= max && minor.length < 500; v += step) minor.push(v);
    if (!minor.length) minor = [min];
  }
  const levels = minor.map((v) => v / divisor);
  const want = (cfg.defaultBetLevel ?? minor[0]!) / divisor;
  const found = levels.findIndex((v) => v >= want);
  return { levels, index: found < 0 ? 0 : found };
}

/** Clamp a stake (major units) to the RGS min/max and snap to `stepBet`. Pure. */
export function clampBet(amount: number, cfg: RgsBetConfig, divisor = API_AMOUNT_DIVISOR): number {
  const min = (cfg.minBet ?? 0) / divisor;
  const max = (cfg.maxBet ?? Infinity) / divisor;
  const step = (cfg.stepBet ?? 0) / divisor;
  let v = Math.min(max, Math.max(min, Number.isFinite(amount) ? amount : min));
  if (step > 0) v = min + Math.round((v - min) / step) * step;
  return Math.min(max, Math.max(min, v));
}
