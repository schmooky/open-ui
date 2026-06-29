/** Responsive screen model: orientation, a named breakpoint, and a fit scale. */

export type Orientation = 'landscape' | 'portrait';

/** A named device bucket. Config can target these to restyle per device. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ScreenState {
  width: number;
  height: number;
  orientation: Orientation;
  /** Named device bucket, derived from the shorter screen edge (see LayoutConfig). */
  breakpoint: Breakpoint;
  /** Multiply reference-px sizes by this to fit the current screen. */
  scale: number;
}

export interface LayoutConfig {
  /** Reference design resolution for landscape / portrait. */
  refLandscape: [number, number];
  refPortrait: [number, number];
  /** Aspect ratio (w/h) below which we switch to the portrait layout. */
  portraitBelowAspect: number;
  /**
   * Breakpoint thresholds on the SHORTER screen edge (px). A phone is "mobile" in
   * both orientations because its short edge stays small — the right intuition for
   * "what device is this". `<= mobile` → mobile, `<= tablet` → tablet, else desktop.
   */
  breakpoints: { mobile: number; tablet: number };
}

export const defaultLayoutConfig: LayoutConfig = {
  // Reference design frames, matching the Figma "DEF" frames 1:1 so offsets map
  // directly: desktop 1920×1080, mobile 360×779 (×3 = 1080×2337). The portrait
  // aspect matches real phones (~0.46), so scaling no longer squashes vertically.
  refLandscape: [1920, 1080],
  refPortrait: [1080, 2337],
  portraitBelowAspect: 0.85,
  breakpoints: { mobile: 480, tablet: 840 },
};

/** Classify the shorter edge into a named device bucket. Pure, total. */
export function breakpointFor(width: number, height: number, cfg: LayoutConfig): Breakpoint {
  const short = Math.min(Math.max(width, 1), Math.max(height, 1));
  if (short <= cfg.breakpoints.mobile) return 'mobile';
  if (short <= cfg.breakpoints.tablet) return 'tablet';
  return 'desktop';
}

export function computeScreen(width: number, height: number, cfg: LayoutConfig): ScreenState {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const orientation: Orientation = w / h < cfg.portraitBelowAspect ? 'portrait' : 'landscape';
  const [rw, rh] = orientation === 'portrait' ? cfg.refPortrait : cfg.refLandscape;
  const scale = Math.min(w / rw, h / rh);
  return { width: w, height: h, orientation, breakpoint: breakpointFor(w, h, cfg), scale };
}
