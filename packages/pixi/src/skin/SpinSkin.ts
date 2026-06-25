import { type Container } from 'pixi.js';
import { type Theme } from '@open-ui/core';

/**
 * A skin owns a control's *look* and nothing else. The view drives it with the
 * current state name; the skin swaps art accordingly. This is the seam where a
 * game's design (Graphics, SVG, Spine, …) plugs in without touching control logic.
 */
export interface SpinSkin {
  /** The display object the view adds into its animated `art` container. */
  readonly view: Container;
  /** React to a state change (swap art, recolor, etc.). */
  update(state: string): void;
  destroy(): void;
}

export type SpinSkinFactory = (theme: Theme) => SpinSkin;
