import { Container, Graphics } from 'pixi.js';
import { type Theme } from '@open-ui/core';
import { type SpinSkin, type SpinSkinFactory } from './SpinSkin';

/**
 * The default skin: art-free, drawn from theme tokens (Charter B2 default skin).
 * Deliberately generic placeholder geometry — a game swaps this for its own skin.
 */
export function drawSpin(g: Graphics, theme: Theme, state: string): void {
  g.clear();
  const r = 64;
  const ring = state === 'disabled' ? theme.color.disabled : theme.color.accent;
  const glyph = state === 'disabled' ? theme.color.textDim : theme.color.text;

  g.circle(0, 0, r).fill({ color: theme.color.surface });
  g.circle(0, 0, r).stroke({ width: 6, color: ring, alpha: 1 });

  // Always the play glyph — the button squishes on press but never spins/rotates.
  const s = 20;
  g.moveTo(-s * 0.5, -s)
    .lineTo(s, 0)
    .lineTo(-s * 0.5, s)
    .closePath()
    .fill({ color: glyph });
}

/** Factory wrapping the placeholder Graphics drawing as a SpinSkin. */
export const defaultSpinSkin: SpinSkinFactory = (theme): SpinSkin => {
  const g = new Graphics();
  const view = new Container();
  view.addChild(g);
  return {
    view,
    update: (state) => drawSpin(g, theme, state),
    destroy: () => view.destroy({ children: true }),
  };
};
