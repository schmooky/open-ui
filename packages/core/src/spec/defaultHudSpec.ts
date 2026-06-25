import type { UISpec } from './types';

/**
 * The reference HUD expressed as data — the knobs `new OpenUI()` ships with.
 * `createUI(defaultHudSpec)` is byte-equivalent to zero-arg `createUI()` (a test
 * guards this). It's the canonical starting point for the docs editor and for
 * games that want to tweak from the default rather than start blank.
 */
export const defaultHudSpec: Readonly<UISpec> = Object.freeze({
  meta: { id: 'open-ui-reference-hud', version: 1 },
  currency: { code: 'USD', decimals: 2 },
  betLadder: { levels: [0.5, 1, 2, 5, 10, 20], index: 1 },
  autoplay: { options: [5, 10, 25, 50, 100, Infinity] },
  lockDuringSpin: true,
});
