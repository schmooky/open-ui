/**
 * Win-celebration classifier — the RTS 14F guardrail. open-ui doesn't render the win
 * (the game does), but this helper lets a game decide HOW LOUD to celebrate without
 * ever celebrating a return ≤ the stake (the most-fined responsible-gambling rule).
 */

export interface WinTier {
  name: string;
  /** Minimum win/stake multiplier for this tier. */
  minMultiplier: number;
}

/** Default escalation tiers (multipliers of stake). */
export const DEFAULT_WIN_TIERS: readonly WinTier[] = Object.freeze([
  { name: 'big', minMultiplier: 10 },
  { name: 'mega', minMultiplier: 50 },
  { name: 'epic', minMultiplier: 100 },
]);

/**
 * Classify a win for celebration. Returns `'none'` when the win is ≤ the stake (so a
 * "win" that returns less than was staked is NEVER celebrated — UKGC RTS 14F), else
 * `'win'` for a positive win below the first tier, or the highest tier whose
 * multiplier threshold is met. Pure + total.
 */
export function winTier(win: number, stake: number, tiers: readonly WinTier[] = DEFAULT_WIN_TIERS): string {
  if (!Number.isFinite(win) || !Number.isFinite(stake) || stake <= 0 || win <= stake) return 'none';
  const mult = win / stake;
  let name = 'win';
  for (const t of tiers) if (mult >= t.minMultiplier) name = t.name;
  return name;
}
