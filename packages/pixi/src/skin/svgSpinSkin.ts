import { Container, Sprite, type Texture } from 'pixi.js';
import { type SpinSkin } from './SpinSkin';

export interface SvgSpinTextures {
  /** Default look (the spin / rotating-arrows icon). */
  default: Texture;
  /** Autoplay look (the STOP-over-count variant). */
  auto: Texture;
}

// The artboard is 203x213 with the button circle centered at (100,100), r=100.
// Anchor each sprite at the circle's center so it sits at the control's origin,
// regardless of the shadow padding baked into the SVG.
const ANCHOR_X = 100 / 203;
const ANCHOR_Y = 100 / 213;
/** Reference-px diameter — spin ≈ 20% of frame width / ~2.4× secondaries (Figma ratio). */
const TARGET_DIAMETER = 220;

function makeSprite(texture: Texture): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(ANCHOR_X, ANCHOR_Y);
  s.scale.set(TARGET_DIAMETER / 200); // circle diameter is 200 in the artboard
  return s;
}

/**
 * A skin that renders the provided spin-button SVGs (as textures) faithfully,
 * swapping between the default and autoplay art by state. The control logic is
 * untouched — this is purely the look.
 */
export function svgSpinSkin(textures: SvgSpinTextures): SpinSkin {
  const view = new Container();
  const def = makeSprite(textures.default);
  const auto = makeSprite(textures.auto);
  auto.visible = false;
  view.addChild(def, auto);

  return {
    view,
    update(state) {
      const isAuto = state === 'auto';
      def.visible = !isAuto;
      auto.visible = isAuto;
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}
