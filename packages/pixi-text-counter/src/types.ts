import type { Container, Ticker } from 'pixi.js';
import type { EaseFn } from './tween/types';

export interface CellRenderer<C extends Container = Container> {
  createCell(digit: number): C;
  setDigit(cell: C, digit: number): void;
  setFiller(cell: C, digit: number): void;
  createSeparator?(char: string): Container;
  destroyCell?(cell: C): void;
}

export interface SeparatorOptions {
  char: string;
  every?: number;
}

export interface LeadingZeroOptions {
  mode: 'show' | 'dim' | 'hide';
  alpha?: number;
  tweenMs?: number;
}

export interface BlurOptions {
  enabled: boolean;
  peak?: number;
}

/**
 * Minimal GSAP-compatible API the Counter uses for `fit` animation.
 * Passing the default `gsap` import satisfies this shape — no need for type imports.
 */
export interface GsapLike {
  to(target: object, vars: Record<string, unknown>): unknown;
  killTweensOf(target: object): void;
}

/**
 * Auto-downscale the counter when its visible width exceeds `maxWidth`.
 *
 * On every value change the counter's `.scale` is tweened (via GSAP) to
 * `maxWidth / visibleWidth`, clamped at `minScale`. Pair with `anchor: 'right'`
 * so the suffix stays at a fixed point while content shrinks leftward.
 */
export interface FitOptions {
  /** Max width the rendered content may occupy, in pixels (unscaled). */
  maxWidth: number;
  /** Floor for scale. Below this the content stops shrinking and may clip. Default `0.4`. */
  minScale?: number;
  /** GSAP tween duration in seconds. Default `0.3`. */
  duration?: number;
  /** GSAP ease string. Default `'power2.out'`. */
  ease?: string;
  /**
   * Which point of the (unscaled) counter stays put when scaling.
   *
   * - `'left'` — pivot at x=0; left edge stays put. Default.
   * - `'right'` — pivot at the right edge of the suffix; right edge stays put.
   * - `'center'` — pivot at the horizontal centre; the readout stays centred at any scale.
   */
  anchor?: 'left' | 'right' | 'center';
  /**
   * The `gsap` module's default export. Passing it yourself keeps GSAP an
   * optional peer dep — no GSAP code reaches your bundle unless `fit` is used.
   */
  gsap: GsapLike;
}

export interface MotionOptions {
  msPerStep?: number;
  staggerMs?: number;
  placeDurationBump?: number;
  minMs?: number;
  maxMs?: number;
  ease?: EaseFn;
}

export interface CounterOptions {
  digits: number;
  cellRenderer: CellRenderer;
  digitWidth: number;
  digitHeight: number;
  initialValue?: number;
  prefix?: string | Container;
  suffix?: string | Container;
  separator?: SeparatorOptions;
  leadingZeros?: LeadingZeroOptions;
  blur?: BlurOptions;
  motion?: MotionOptions;
  ticker?: Ticker;
  /**
   * Number of fractional digit columns (currency minor units).
   *
   * Values passed to `setValue` are interpreted as **minor units** (e.g. cents):
   * with `decimals: 2`, `setValue(190000)` displays `1,900.00`.
   *
   * Use `0` (default) for integer-only counters, `2` for USD/EUR/GBP-style currency,
   * `3` for Kuwaiti dinar, `8` for BTC, etc.
   */
  decimals?: number;
  /** Character to display between integer and decimal parts. Default `.`. */
  decimalChar?: string;
  /** Auto-downscale when the visible content would exceed `fit.maxWidth`. Requires GSAP. */
  fit?: FitOptions;
}

export interface SetValueOptions {
  direction?: 'up' | 'down' | 'auto';
  instant?: boolean;
  duration?: number;
  onComplete?: () => void;
}

export type RollDirection = 'up' | 'down';

export interface RollStartEvent {
  from: number;
  to: number;
  direction: RollDirection;
}

export interface RollEndEvent {
  value: number;
}

export interface DigitSettleEvent {
  column: number;
  digit: number;
}

export const DEFAULTS = {
  motion: {
    msPerStep: 35,
    staggerMs: 28,
    placeDurationBump: 25,
    minMs: 280,
    maxMs: 620,
  },
  leadingZeros: {
    mode: 'show' as const,
    alpha: 0.35,
    tweenMs: 150,
  },
  blur: {
    enabled: false,
    peak: 8,
  },
  separatorEvery: 3,
} as const;
