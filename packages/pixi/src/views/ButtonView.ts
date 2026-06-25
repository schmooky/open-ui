import { Container, Graphics, Text, Sprite, Circle, Rectangle, type Texture, type Ticker } from 'pixi.js';
import { type ButtonControl, type OpenUI, type Transition } from '@open-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';
import { isDesktop } from '../util';

/** Built-in placeholder glyphs the button can draw without art. */
export type ButtonGlyph = 'menu' | 'close' | 'speaker' | 'speaker-mute' | 'fullscreen' | 'fullscreen-exit' | 'none';

export interface ButtonViewOptions {
  shape?: 'circle' | 'pill';
  radius?: number;
  height?: number;
  /** Placeholder icon drawn as simple lines (when no texture). */
  glyph?: ButtonGlyph;
  /** Skin with real art: a Sprite shown instead of placeholder geometry. */
  iconTexture?: Texture;
  /** Target sprite height in reference px. */
  iconTarget?: number;
  /** Monochrome look — white circle, black ring, black glyph (matches the turbo
   *  button's b&w art). Only affects the drawn (no-texture) circle path. */
  mono?: boolean;
}

/**
 * Generic button view. With `iconTexture` it renders the provided art as a Sprite
 * (swappable via `setIconTexture`, e.g. ☰ ↔ ✕); otherwise a neutral token placeholder.
 * Pointer input drives the control's state machine; entry transitions play on `art`.
 */
export class ButtonView extends ControlView {
  private readonly art = new Container();
  private readonly bg = new Graphics();
  private sprite: Sprite | undefined;
  private labelText: Text | undefined;
  private readonly tween: Tweener;
  private readonly shape: 'circle' | 'pill';
  private readonly radius: number;
  private readonly pillHeight: number;
  private glyph: ButtonGlyph;
  private readonly iconTarget: number;
  private readonly mono: boolean;

  constructor(private readonly btn: ButtonControl, ui: OpenUI, ticker: Ticker, opts: ButtonViewOptions = {}) {
    super(btn, ui);
    this.tween = new Tweener(ticker);
    this.shape = opts.shape ?? 'circle';
    this.radius = opts.radius ?? 40;
    this.pillHeight = opts.height ?? 56;
    this.glyph = opts.glyph ?? 'none';
    this.iconTarget = opts.iconTarget ?? 84;
    this.mono = opts.mono ?? false;
    this.addChild(this.art);

    if (opts.iconTexture) {
      this.sprite = new Sprite(opts.iconTexture);
      this.sprite.anchor.set(0.5);
      this.fitSprite();
      this.art.addChild(this.sprite);
    } else {
      this.art.addChild(this.bg);
      if (btn.label) {
        this.labelText = new Text({
          text: ui.t(btn.label),
          style: { fontFamily: ui.theme.type.family, fontSize: 22, fill: ui.theme.color.text, fontWeight: '700' },
        });
        this.labelText.anchor.set(0.5);
        this.art.addChild(this.labelText);
      }
    }

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUpOutside);

    this.disposers.push(
      this.btn.state.subscribe(() => {
        this.redraw();
        this.updateInteractive();
      }),
      this.btn.onTransition((t) => this.play(t)),
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return; // a view disposed mid-emit can still be called
        if (this.labelText && this.btn.label) {
          this.labelText.text = this.ui.t(this.btn.label);
          this.updateHit();
        }
      }),
    );
    this.redraw();
    this.updateHit();
    this.updateInteractive();
  }

  /** Swap the displayed art (e.g. ☰ → ✕). */
  setIconTexture(tex: Texture): void {
    if (!this.sprite) return;
    this.sprite.texture = tex;
    this.fitSprite();
    this.updateHit();
  }

  /** Swap the placeholder glyph (e.g. speaker ↔ speaker-mute, fullscreen ↔ exit). */
  setGlyph(glyph: ButtonGlyph): void {
    if (this.glyph === glyph) return;
    this.glyph = glyph;
    this.redraw();
    this.updateHit();
  }

  private fitSprite(): void {
    if (!this.sprite) return;
    this.sprite.scale.set(1);
    this.sprite.scale.set(this.iconTarget / this.sprite.height);
  }

  private readonly onOver = (): void => {
    if (isDesktop() && this.btn.current === 'idle') this.btn.setState('hover');
  };
  private readonly onOut = (): void => {
    if (this.btn.current === 'hover') this.btn.setState('idle');
  };
  private readonly onDown = (): void => {
    if (this.btn.interactable) this.btn.setState('pressed');
  };
  private readonly onUp = (): void => {
    if (this.btn.current === 'pressed') {
      this.btn.setState('idle');
      this.btn.activate();
    }
  };
  private readonly onUpOutside = (): void => {
    if (this.btn.current === 'pressed') this.btn.setState('idle');
  };

  private updateHit(): void {
    if (this.sprite) {
      const w = this.sprite.width;
      const h = this.sprite.height;
      this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    } else if (this.shape === 'circle') {
      this.hitArea = new Circle(0, 0, this.radius + 6);
    } else {
      const w = this.labelText ? this.labelText.width + 48 : 120;
      this.hitArea = new Rectangle(-w / 2, -this.pillHeight / 2, w, this.pillHeight);
    }
  }

  private updateInteractive(): void {
    const ok = this.btn.interactable;
    this.eventMode = ok ? 'static' : 'none';
    this.cursor = ok ? 'pointer' : 'default';
  }

  private redraw(): void {
    if (this.sprite) {
      this.sprite.alpha = this.btn.current === 'disabled' ? 0.5 : 1;
      return;
    }
    const t = this.ui.theme;
    const g = this.bg;
    g.clear();
    const disabled = this.btn.current === 'disabled';
    // Monochrome (turbo-style) buttons: white circle, black ring, black glyph.
    const fillC = this.mono ? '#ffffff' : t.color.surface;
    const lineC = this.mono ? '#0a0a0a' : t.color.accent;
    const ink = this.mono ? (disabled ? '#9aa0a6' : '#0a0a0a') : disabled ? t.color.textDim : t.color.text;
    if (this.shape === 'circle') {
      const r = this.radius;
      g.circle(0, 0, r).fill({ color: fillC, alpha: this.mono && disabled ? 0.6 : 1 });
      g.circle(0, 0, r).stroke({ width: this.mono ? 5 : 4, color: lineC });
      if (this.glyph === 'menu') {
        for (const dy of [-8, 0, 8]) g.moveTo(-13, dy).lineTo(13, dy).stroke({ width: 4, color: ink });
      } else if (this.glyph === 'close') {
        g.moveTo(-10, -10).lineTo(10, 10).moveTo(10, -10).lineTo(-10, 10).stroke({ width: 4, color: ink });
      } else if (this.glyph === 'speaker' || this.glyph === 'speaker-mute') {
        g.poly([-12, -4, -6, -4, 1, -11, 1, 11, -6, 4, -12, 4]).fill({ color: ink });
        if (this.glyph === 'speaker') {
          g.moveTo(6, -6).lineTo(11, 0).lineTo(6, 6).stroke({ width: 2.5, color: ink });
          g.moveTo(11, -9).lineTo(17, 0).lineTo(11, 9).stroke({ width: 2.5, color: ink });
        } else {
          g.moveTo(7, -6).lineTo(17, 6).moveTo(17, -6).lineTo(7, 6).stroke({ width: 2.5, color: ink });
        }
      } else if (this.glyph === 'fullscreen') {
        const a = 13, b = 6;
        g.moveTo(-a, -a + b).lineTo(-a, -a).lineTo(-a + b, -a)
          .moveTo(a - b, -a).lineTo(a, -a).lineTo(a, -a + b)
          .moveTo(-a, a - b).lineTo(-a, a).lineTo(-a + b, a)
          .moveTo(a - b, a).lineTo(a, a).lineTo(a, a - b)
          .stroke({ width: 3, color: ink });
      } else if (this.glyph === 'fullscreen-exit') {
        const c = 4, d = 12;
        g.moveTo(-d, -c).lineTo(-c, -c).lineTo(-c, -d)
          .moveTo(d, -c).lineTo(c, -c).lineTo(c, -d)
          .moveTo(-d, c).lineTo(-c, c).lineTo(-c, d)
          .moveTo(d, c).lineTo(c, c).lineTo(c, d)
          .stroke({ width: 3, color: ink });
      }
    } else {
      const w = this.labelText ? this.labelText.width + 48 : 120;
      const h = this.pillHeight;
      g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: t.color.surfaceAlt }).stroke({ width: 3, color: t.color.accent });
    }
    if (this.labelText) this.labelText.style.fill = ink;
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
