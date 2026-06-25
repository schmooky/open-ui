import type { ScreenState } from './screen';

/** Explicit anchors — no magic numbers buried in components (Charter P9). */
export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface LayoutSpec {
  anchor: Anchor;
  /** Offset from the anchor, in reference px (scaled with the screen). */
  offset?: [number, number];
  /** Extra scale multiplier on top of the screen's fit scale. */
  scale?: number;
  /** Rotation in degrees, clockwise. Default 0. */
  rotation?: number;
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  /** Rotation in radians (resolved from `LayoutSpec.rotation`, which is degrees). */
  rotation: number;
}

function anchorFactors(anchor: Anchor): [number, number] {
  const ax = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
  const ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
  return [ax, ay];
}

/** Resolve a control's layout against the current screen. Pure math. */
export function resolvePlacement(spec: LayoutSpec, screen: ScreenState): Placement {
  const [ax, ay] = anchorFactors(spec.anchor);
  const [ox, oy] = spec.offset ?? [0, 0];
  return {
    x: ax * screen.width + ox * screen.scale,
    y: ay * screen.height + oy * screen.scale,
    scale: screen.scale * (spec.scale ?? 1),
    rotation: ((spec.rotation ?? 0) * Math.PI) / 180,
  };
}
