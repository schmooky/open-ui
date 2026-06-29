import { Container, Graphics, Sprite, Circle, type Texture, type Ticker } from 'pixi.js';
import { type TurboControl, type OpenUI, type Transition } from '@open-slot-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';

export interface TurboViewOptions {
  /** One texture per mode (index-aligned). Wins over off/on when provided. */
  modeTextures?: Texture[];
  /** 2-mode art: off frame + engaged frame (used when modeTextures is absent). */
  offTexture?: Texture;
  onTexture?: Texture;
  target?: number;
  radius?: number;
}

/**
 * Turbo switcher view. One tap cycles to the next mode (`cycle()`), wrapping back
 * to off. Renders whatever art it has — per-mode textures, a 2-mode off/on pair,
 * or a token-drawn fallback — and, for 3+ modes, overlays a small level indicator
 * (lit pips) so "turbo" vs "super" reads at a glance even on 2-frame art.
 */
export class TurboView extends ControlView {
  private readonly art = new Container();
  private readonly bg = new Graphics();
  private sprite: Sprite | undefined;
  private readonly tween: Tweener;
  private readonly modeTex: Texture[] | undefined;
  private readonly offTex: Texture | undefined;
  private readonly onTex: Texture | undefined;
  private readonly target: number;
  private readonly radius: number;

  constructor(private readonly turbo: TurboControl, ui: OpenUI, ticker: Ticker, opts: TurboViewOptions = {}) {
    super(turbo, ui);
    this.tween = new Tweener(ticker);
    this.modeTex = opts.modeTextures?.length ? opts.modeTextures : undefined;
    this.offTex = opts.offTexture;
    this.onTex = opts.onTexture;
    this.target = opts.target ?? 84;
    this.radius = opts.radius ?? 40;

    const hasArt = this.modeTex || this.offTex || this.onTex;
    if (hasArt) {
      this.sprite = new Sprite(this.texFor());
      this.sprite.anchor.set(0.5);
      this.art.addChild(this.sprite);
    } else {
      this.art.addChild(this.bg);
    }
    this.addChild(this.art);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Circle(0, 0, (this.sprite ? this.target / 2 : this.radius) + 8);
    this.on('pointerup', this.onUp);

    this.disposers.push(
      this.turbo.state.subscribe(() => this.redraw()),
      this.turbo.index.subscribe(() => this.redraw()),
      this.turbo.onTransition((t) => this.play(t)),
    );
    this.redraw();
  }

  private readonly onUp = (): void => {
    this.turbo.cycle();
  };

  private texFor(): Texture | undefined {
    const i = this.turbo.index.get();
    if (this.modeTex) return this.modeTex[Math.min(i, this.modeTex.length - 1)] ?? this.modeTex[0];
    return i > 0 ? (this.onTex ?? this.offTex) : (this.offTex ?? this.onTex);
  }

  private fit(): void {
    if (!this.sprite) return;
    this.sprite.scale.set(1);
    this.sprite.scale.set(this.target / this.sprite.height);
  }

  private redraw(): void {
    const th = this.ui.theme;
    const i = this.turbo.index.get();
    const disabled = this.turbo.current === 'disabled';

    if (this.sprite) {
      const tex = this.texFor();
      if (tex) this.sprite.texture = tex;
      this.fit();
      this.sprite.alpha = disabled ? 0.5 : 1;
    } else {
      // Drawn fallback: brightness climbs with the mode level.
      const lit = i > 0;
      const r = this.radius;
      this.bg.clear();
      this.bg
        .circle(0, 0, r)
        .fill({ color: lit ? th.color.accent : th.color.surface, alpha: lit ? Math.min(1, 0.55 + i * 0.25) : 1 })
        .stroke({ width: 4, color: th.color.accent });
      // a small lightning wedge in the middle
      this.bg
        .poly([-6, -r * 0.42, 8, -4, 0, -4, 7, r * 0.42, -9, 2, 0, 2])
        .fill({ color: lit ? th.color.accentText : th.color.accent, alpha: disabled ? 0.5 : 1 });
    }

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
