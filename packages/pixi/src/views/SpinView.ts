import { Container, Circle, Graphics, Text, type Ticker } from 'pixi.js';
import { type SpinControl, type OpenUI, type Transition } from '@open-slot-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';
import { defaultSpinSkin } from '../skin/defaultSkin';
import { type SpinSkin, type SpinSkinFactory } from '../skin/SpinSkin';
import { isDesktop } from '../util';

/**
 * Pixi view for the spin control. Owns input forwarding + transition playback;
 * delegates ALL drawing to a swappable skin (Charter B3/P8). The layout scale
 * lives on `this`; transitions animate the inner `art` container, so squish/turn
 * never fight the responsive fit-scale — and the skin's art animates with them.
 */
export interface SpinViewOptions {
  /** Skin factory for the spin art. */
  skin?: SpinSkinFactory;
  /** How long (ms) a press must be held before hold-to-spin engages. Default 260. */
  holdDelayMs?: number;
}

export class SpinView extends ControlView {
  private readonly art = new Container();
  private readonly skin: SpinSkin;
  private readonly tween: Tweener;
  private readonly holdDelayMs: number;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private holding = false;
  /** Free-spins face — a ring + remaining count + "FS"; shown when `spin.freeSpins > 0`. */
  private readonly fsFace = new Container();
  private readonly fsCount: Text;
  private readonly fsLabel: Text;
  /** Autoplay STOP face — a "STOP" label over the remaining count (or ∞); shown while
   *  autoplay is active. Tapping the spin button then STOPS autoplay. */
  private readonly stopFace = new Container();
  private readonly stopCount: Text;
  private readonly stopLabel: Text;

  constructor(
    private readonly spin: SpinControl,
    ui: OpenUI,
    ticker: Ticker,
    skinOrOpts: SpinSkinFactory | SpinViewOptions = defaultSpinSkin,
  ) {
    super(spin, ui);
    this.tween = new Tweener(ticker);
    // Back-compat: a bare factory still works; an options object adds hold tuning.
    const opts: SpinViewOptions = typeof skinOrOpts === 'function' ? { skin: skinOrOpts } : skinOrOpts;
    const skinFactory: SpinSkinFactory = opts.skin ?? defaultSpinSkin;
    this.holdDelayMs = opts.holdDelayMs ?? 260;

    this.skin = skinFactory(ui.theme);
    this.art.addChild(this.skin.view);

    // Free-spins face: a themed ring + big remaining count over a small "FS" label.
    // Built once, hidden until `setFreeSpins(n > 0)`; lives in `art` so it squishes too.
    const c = ui.theme.color;
    const ring = new Graphics().circle(0, 0, 64).fill({ color: c.surface }).stroke({ width: 6, color: c.accent });
    this.fsCount = new Text({ text: '0', style: { fontFamily: ui.theme.type.family, fontSize: 44, fill: c.text, fontWeight: '800' } });
    this.fsCount.anchor.set(0.5);
    this.fsCount.y = -8;
    this.fsLabel = new Text({ text: ui.t('openui.freeSpins'), style: { fontFamily: ui.theme.type.family, fontSize: 18, fill: c.accent, fontWeight: '800', letterSpacing: 2 } });
    this.fsLabel.anchor.set(0.5);
    this.fsLabel.y = 26;
    this.fsFace.addChild(ring, this.fsCount, this.fsLabel);
    this.fsFace.visible = false;
    this.art.addChild(this.fsFace);

    // Autoplay STOP face: a white button with a "STOP" label over the big remaining
    // count (or ∞). Built once, shown while autoplay is active.
    const stopRing = new Graphics().circle(0, 0, 96).fill({ color: 0xffffff }).stroke({ width: 7, color: 0x0a0a0a });
    this.stopLabel = new Text({ text: ui.t('openui.stop') === 'openui.stop' ? 'STOP' : ui.t('openui.stop'), style: { fontFamily: ui.theme.type.family, fontSize: 26, fill: 0x0a0a0a, fontWeight: '900', letterSpacing: 3 } });
    this.stopLabel.anchor.set(0.5);
    this.stopLabel.y = -38;
    this.stopCount = new Text({ text: '0', style: { fontFamily: ui.theme.type.family, fontSize: 64, fill: 0x0a0a0a, fontWeight: '900' } });
    this.stopCount.anchor.set(0.5);
    this.stopCount.y = 16;
    this.stopFace.addChild(stopRing, this.stopLabel, this.stopCount);
    this.stopFace.visible = false;
    this.art.addChild(this.stopFace);

    this.addChild(this.art);

    this.hitArea = new Circle(0, 0, 118);
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUpOutside);

    this.disposers.push(
      this.spin.state.subscribe(() => {
        this.skin.update(this.spin.current);
        this.updateInteractive();
      }),
      // re-dim if slam-stop is toggled at runtime (e.g. applyJurisdiction)
      this.spin.allowSlamStop.subscribe(() => this.updateInteractive()),
      this.spin.onTransition((t) => this.play(t)),
      // free-spins face: switch between the normal skin and the "N FS" counter
      this.spin.freeSpins.subscribe(() => this.updateFaces()),
      // autoplay: while active the spin button becomes the STOP-count button
      this.ui.autoplay.state.subscribe(() => {
        this.updateFaces();
        this.updateInteractive();
      }),
      this.ui.autoplay.count.subscribe(() => this.updateFaces()),
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.fsLabel.text = this.ui.t('openui.freeSpins');
      }),
    );

    this.skin.update(this.spin.current);
    this.updateFaces();
    this.updateInteractive();
  }

  /** Pick the spin face: autoplay STOP-count (top priority) → free-spins counter →
   *  the normal skin. */
  private updateFaces(): void {
    const auto = this.ui.autoplay.isActive;
    const n = this.spin.freeSpins.get();
    const fs = n > 0 && !auto;
    if (auto) {
      const c = this.ui.autoplay.count.get();
      this.stopCount.text = c === Infinity ? '∞' : String(c);
    }
    if (fs) this.fsCount.text = String(n);
    this.stopFace.visible = auto;
    this.fsFace.visible = fs;
    this.skin.view.visible = !auto && !fs;
  }

  private readonly onOver = (): void => {
    if (isDesktop() && this.spin.current === 'idle') this.spin.setState('hover');
  };
  private readonly onOut = (): void => {
    if (this.spin.current === 'hover') this.spin.setState('idle');
  };
  private readonly onDown = (): void => {
    if (!this.spin.interactable) return;
    this.spin.setState('pressed');
    if (this.spin.holdToSpin) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = undefined;
        if (this.spin.current !== 'pressed') return; // released before the threshold
        if (this.spin.holdBegin()) {
          this.holding = true;
          if (typeof window !== 'undefined') {
            window.addEventListener('pointerup', this.endHoldGlobal);
            window.addEventListener('pointercancel', this.endHoldGlobal);
          }
        }
      }, this.holdDelayMs);
    }
  };
  private readonly onUp = (): void => {
    if (this.holding) return this.endHold();
    this.clearHoldTimer();
    // While autoplay is running the spin button is the STOP button → tap stops it.
    if (this.ui.autoplay.isActive) {
      this.ui.autoplay.stop();
      return;
    }
    if (this.spin.current === 'pressed') {
      this.spin.setState('idle');
      this.spin.activate();
    }
  };
  private readonly onUpOutside = (): void => {
    if (this.holding) return this.endHold();
    this.clearHoldTimer();
    if (this.spin.current === 'pressed') this.spin.setState('idle');
  };

  private readonly endHoldGlobal = (): void => this.endHold();
  private clearHoldTimer(): void {
    if (this.holdTimer != null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    }
  }
  private endHold(): void {
    if (!this.holding) return;
    this.holding = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerup', this.endHoldGlobal);
      window.removeEventListener('pointercancel', this.endHoldGlobal);
    }
    this.spin.holdEnd();
    if (this.spin.current === 'pressed') this.spin.setState('idle');
  }

  private updateInteractive(): void {
    // Stay tappable while autoplay is active (the STOP button) even though the spin
    // control itself is locked mid-round.
    const ok = this.spin.interactable || this.ui.autoplay.isActive;
    this.eventMode = ok ? 'static' : 'none';
    this.cursor = ok ? 'pointer' : 'default';
    // When slam-stop is disabled (jurisdiction), dim the button while a spin is in
    // progress so the player sees it's locked. Default behavior is unchanged.
    const inSpin = this.spin.current === 'spinning' || this.spin.current === 'auto' || this.spin.current === 'stop';
    this.art.alpha = !this.spin.allowSlamStop.get() && inSpin ? 0.45 : 1;
  }

  private play(t: Transition | undefined): void {
    this.animating = true;
    void this.tween.run(this.art, t, this.ui.theme).then(() => {
      this.animating = false;
    });
  }

  override dispose(): void {
    this.clearHoldTimer();
    this.endHold();
    this.tween.stop();
    this.skin.destroy();
    super.dispose();
  }
}
