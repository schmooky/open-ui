import { Container, Graphics, Text, Sprite, Circle, Rectangle, type Texture, type Ticker } from 'pixi.js';
import { type ButtonControl, type OpenUI, type Transition } from '@open-slot-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';

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
  /** Inverted look — solid black circle with a white glyph, no ring (the Figma ☰
   *  menu button). Only affects the drawn (no-texture) circle path. */
  dark?: boolean;
}

/**
 * Generic button view. With `iconTexture` it renders the provided art as a Sprite
 * (swappable via `setIconTexture`, e.g. ☰ ↔ ✕); otherwise a neutral token placeholder.
 * Pointer input drives the control's state machine; entry transitions play on `art`.
 */
/** Exact Figma glyph vectors (viewBox 22.5×22.5), rendered via `Graphics.svg()`.
 *  Sound = an OUTLINE speaker + a single wave; fullscreen = rounded corner brackets. */
const GLYPH_SVG: Partial<Record<ButtonGlyph, string>> = {
  speaker:
    '<svg viewBox="0 0 22.5 22.5" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M13.6745 5.01252C13.9316 4.84399 14.2647 4.8292 14.5397 4.97456C14.8146 5.1199 14.9868 5.40142 14.9872 5.706L15.0007 16.8107C15.0011 17.1153 14.8296 17.3934 14.555 17.5333C14.2804 17.6731 13.9472 17.6517 13.6897 17.4781L10.4454 15.2905L8.61605 15.2722C6.76074 15.2537 5.25495 13.7655 5.25266 11.9484L5.25073 10.3739C5.2486 8.55679 6.75081 7.09863 8.6061 7.11714L10.4355 7.13539L13.6745 5.01252Z" fill="none" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M16.1933 9.375C16.6252 10.4652 16.6015 11.654 16.1257 12.75" fill="none" stroke="black" stroke-width="3" stroke-linecap="round"/>' +
    '</svg>',
  'speaker-mute':
    '<svg viewBox="0 0 22.5 22.5" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M13.6745 5.01252C13.9316 4.84399 14.2647 4.8292 14.5397 4.97456C14.8146 5.1199 14.9868 5.40142 14.9872 5.706L15.0007 16.8107C15.0011 17.1153 14.8296 17.3934 14.555 17.5333C14.2804 17.6731 13.9472 17.6517 13.6897 17.4781L10.4454 15.2905L8.61605 15.2722C6.76074 15.2537 5.25495 13.7655 5.25266 11.9484L5.25073 10.3739C5.2486 8.55679 6.75081 7.09863 8.6061 7.11714L10.4355 7.13539L13.6745 5.01252Z" fill="none" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M15.5 8.5L19.5 13.5M19.5 8.5L15.5 13.5" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>',
  fullscreen:
    '<svg viewBox="0 0 22.5 22.5" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M7.875 18H7.5C5.84315 18 4.5 16.6569 4.5 15V14.25M7.875 4.5H7.5C5.84315 4.5 4.5 5.84315 4.5 7.5V8.25M14.25 4.5H15C16.6569 4.5 18 5.84315 18 7.5V8.25M14.25 18H15C16.6569 18 18 16.6569 18 15V14.25" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
  'fullscreen-exit':
    '<svg viewBox="0 0 22.5 22.5" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4.5 8.25H5.25C6.9 8.25 8.25 6.9 8.25 5.25V4.5M14.25 4.5V5.25C14.25 6.9 15.6 8.25 17.25 8.25H18M18 14.25H17.25C15.6 14.25 14.25 15.6 14.25 17.25V18M8.25 18V17.25C8.25 15.6 6.9 14.25 5.25 14.25H4.5" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
};

export class ButtonView extends ControlView {
  private readonly art = new Container();
  private readonly bg = new Graphics();
  private readonly glyphG = new Graphics();
  private sprite: Sprite | undefined;
  private labelText: Text | undefined;
  private readonly tween: Tweener;
  private readonly shape: 'circle' | 'pill';
  private readonly radius: number;
  private readonly pillHeight: number;
  private glyph: ButtonGlyph;
  private readonly iconTarget: number;
  private readonly mono: boolean;
  private readonly dark: boolean;

  constructor(private readonly btn: ButtonControl, ui: OpenUI, ticker: Ticker, opts: ButtonViewOptions = {}) {
    super(btn, ui);
    this.tween = new Tweener(ticker);
    this.shape = opts.shape ?? 'circle';
    this.radius = opts.radius ?? 40;
    this.pillHeight = opts.height ?? 56;
    this.glyph = opts.glyph ?? 'none';
    this.iconTarget = opts.iconTarget ?? 84;
    this.mono = opts.mono ?? false;
    this.dark = opts.dark ?? false;
    this.addChild(this.art);

    if (opts.iconTexture) {
      this.sprite = new Sprite(opts.iconTexture);
      this.sprite.anchor.set(0.5);
      this.fitSprite();
      this.art.addChild(this.sprite);
    } else {
      this.art.addChild(this.bg, this.glyphG);
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
    // No hover reaction (pointerover/out): these buttons look the same whether or not
    // a pointer is over them — only press + disabled change their look.
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUpOutside);

    this.disposers.push(
      this.btn.state.subscribe(() => {
        this.redraw();
        this.updateInteractive();
      }),
      this.btn.onTransition((t) => this.play(t)),
      // The host input lock gates `interactable` without a state change, so react to
      // it directly: a locked/disabled button dims to a semi-transparent state.
      this.ui.locked.subscribe(() => {
        this.redraw();
        this.updateInteractive();
      }),
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
    // Semi-transparent when not usable (locked during a spin, or a disabled state) —
    // matches the Figma "default" disabled treatment for the menu / ± / buy buttons.
    this.alpha = ok ? 1 : 0.4;
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
    // Dark (Figma ☰) buttons: solid black circle, white glyph, no ring.
    // Monochrome (turbo-style) buttons: white circle, black ring, black glyph.
    const fillC = this.dark ? '#0a0a0a' : this.mono ? '#ffffff' : t.color.surface;
    const lineC = this.mono ? '#0a0a0a' : t.color.accent;
    const ink = this.dark ? '#ffffff' : this.mono ? (disabled ? '#9aa0a6' : '#0a0a0a') : disabled ? t.color.textDim : t.color.text;
    this.glyphG.clear();
    this.glyphG.visible = false;
    if (this.shape === 'circle') {
      const r = this.radius;
      if (this.mono) {
        // Figma b&w button: a soft drop shadow, a white fill, and an INSET black ring
        // (ring at ~0.925r, width ~0.15r — matching the exported button art).
        g.circle(0, r * 0.16, r).fill({ color: 0x000000, alpha: disabled ? 0.08 : 0.18 });
        g.circle(0, 0, r).fill({ color: '#ffffff', alpha: disabled ? 0.6 : 1 });
        g.circle(0, 0, r * 0.925).stroke({ width: r * 0.15, color: '#0a0a0a', alpha: disabled ? 0.5 : 1 });
      } else if (this.dark) {
        g.circle(0, r * 0.16, r).fill({ color: 0x000000, alpha: 0.18 });
        g.circle(0, 0, r).fill({ color: '#0a0a0a' });
      } else {
        g.circle(0, 0, r).fill({ color: fillC }).circle(0, 0, r).stroke({ width: 4, color: lineC });
      }

      const svg = GLYPH_SVG[this.glyph];
      if (svg) {
        // Exact Figma glyph vector (sound / fullscreen), scaled to ~75% of the button
        // and centred — viewBox is 22.5, so scale = r/15 puts it at the design size.
        const s = r / 15;
        this.glyphG.svg(svg);
        this.glyphG.scale.set(s);
        this.glyphG.position.set(-11.25 * s, -11.25 * s);
        this.glyphG.alpha = disabled ? 0.5 : 1;
        this.glyphG.visible = true;
      } else if (this.glyph === 'menu') {
        const barW = this.dark ? 6 : 4;
        const spread = this.dark ? 9 : 8;
        for (const dy of [-spread, 0, spread]) g.moveTo(-14, dy).lineTo(14, dy).stroke({ width: barW, color: ink, cap: 'round' });
      } else if (this.glyph === 'close') {
        g.moveTo(-10, -10).lineTo(10, 10).moveTo(10, -10).lineTo(-10, 10).stroke({ width: 4, color: ink });
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
