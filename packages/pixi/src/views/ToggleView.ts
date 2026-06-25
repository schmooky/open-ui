import { Container, Graphics, Sprite, Circle, Rectangle, type Texture, type Ticker } from 'pixi.js';
import { type ToggleControl, type OpenUI, type Transition } from '@open-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';

export interface ToggleViewOptions {
  offTexture?: Texture;
  onTexture?: Texture;
  target?: number;
  radius?: number;
}

/**
 * On/off toggle view (e.g. Turbo). Swaps the off/on art on state change; falls
 * back to a token-colored circle when no textures are given. Tap → `toggle()`.
 */
export class ToggleView extends ControlView {
  private readonly art = new Container();
  private readonly bg = new Graphics();
  private sprite: Sprite | undefined;
  private readonly tween: Tweener;
  private readonly offTex: Texture | undefined;
  private readonly onTex: Texture | undefined;
  private readonly target: number;
  private readonly radius: number;

  constructor(private readonly toggle: ToggleControl, ui: OpenUI, ticker: Ticker, opts: ToggleViewOptions = {}) {
    super(toggle, ui);
    this.tween = new Tweener(ticker);
    this.offTex = opts.offTexture;
    this.onTex = opts.onTexture;
    this.target = opts.target ?? 84;
    this.radius = opts.radius ?? 40;

    if (this.offTex || this.onTex) {
      this.sprite = new Sprite(this.texFor());
      this.sprite.anchor.set(0.5);
      this.fit();
      this.art.addChild(this.sprite);
    } else {
      this.art.addChild(this.bg);
    }
    this.addChild(this.art);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    // Art → circular hit; drawn fallback → a pill-switch hit area.
    this.hitArea = this.sprite ? new Circle(0, 0, this.target / 2 + 8) : new Rectangle(-35, -23, 70, 46);
    this.on('pointerup', this.onUp);

    this.disposers.push(
      this.toggle.state.subscribe(() => this.redraw()),
      this.toggle.onTransition((t) => this.play(t)),
    );
    this.redraw();
  }

  private readonly onUp = (): void => {
    this.toggle.toggle();
  };

  private texFor(): Texture | undefined {
    return this.toggle.isOn ? (this.onTex ?? this.offTex) : (this.offTex ?? this.onTex);
  }

  private fit(): void {
    if (!this.sprite) return;
    this.sprite.scale.set(1);
    this.sprite.scale.set(this.target / this.sprite.height);
  }

  private redraw(): void {
    if (this.sprite) {
      const tex = this.texFor();
      if (tex) this.sprite.texture = tex;
      this.fit();
      this.sprite.alpha = this.toggle.current === 'disabled' ? 0.5 : 1;
      return;
    }
    // A clean pill switch: muted track off, accent track on, white knob slides.
    const th = this.ui.theme;
    const on = this.toggle.isOn;
    const w = 54;
    const h = 30;
    const r = h / 2;
    const knobX = on ? w / 2 - r : -(w / 2 - r);
    this.bg.clear()
      .roundRect(-w / 2, -h / 2, w, h, r)
      .fill({ color: on ? th.color.accent : th.color.surfaceAlt })
      .roundRect(-w / 2, -h / 2, w, h, r)
      .stroke({ width: 2, color: on ? th.color.accent : th.color.textDim, alpha: on ? 1 : 0.6 })
      .circle(knobX, 0, r - 4)
      .fill({ color: 0xffffff });
  }

  private play(t: Transition | undefined): void {
    this.animating = true;
    void this.tween.run(this.art, t, this.ui.theme).then(() => {
      this.animating = false;
    });
  }

  override dispose(): void {
    this.tween.stop();
    super.dispose();
  }
}
