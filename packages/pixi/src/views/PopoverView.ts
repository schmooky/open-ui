import { type Ticker, type Texture } from 'pixi.js';
import { type PanelControl, type SliderControl, type ButtonControl, type OpenUI } from '@open-ui/core';
import { ControlView } from './ControlView';
import { SliderView } from './SliderView';
import { ButtonView } from './ButtonView';

export interface PopoverParts {
  music: SliderControl;
  sfx: SliderControl;
  rules: ButtonControl;
}

export interface PopoverArt {
  rulesTexture?: Texture;
  musicTrack?: Texture;
  soundTrack?: Texture;
}

interface FanItem {
  view: ControlView;
  tx: number;
  ty: number;
  prog: number;
}

const GAP = 80; // vertical spacing between fanned items (ref px)
const RISE = 26; // how far each item rises into place
const STAGGER = 38; // ms between pops — snappy "pop-pop-pop"
// slider track is 290x60 @ ~0.9 → its visual centre, used as the scale pivot
const SLIDER_PIVOT_X = 130;
const SLIDER_PIVOT_Y = 27;

/**
 * The settings flyout as a VERTICAL FAN: on open, the options swoosh up and pop
 * in one-by-one (bottom→top); on close they retract together. Items are
 * right-aligned and rise above the (right-side) menu button. No static panel.
 */
export class PopoverView extends ControlView {
  private readonly music: SliderView;
  private readonly sfx: SliderView;
  private readonly rules: ButtonView;
  private readonly items: FanItem[];
  private phase = 0;
  private running = false;
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly panel: PanelControl, parts: PopoverParts, ui: OpenUI, private readonly ticker: Ticker, art: PopoverArt = {}) {
    super(panel, ui);

    this.rules = new ButtonView(parts.rules, ui, ticker, { shape: 'pill', height: 50, iconTexture: art.rulesTexture, iconTarget: 50 });
    this.music = new SliderView(parts.music, ui, art.musicTrack);
    this.sfx = new SliderView(parts.sfx, ui, art.soundTrack);
    // pivot sliders at their centre so they scale from the middle, not the left edge
    this.music.pivot.set(SLIDER_PIVOT_X, SLIDER_PIVOT_Y);
    this.sfx.pivot.set(SLIDER_PIVOT_X, SLIDER_PIVOT_Y);

    // Right-aligned column rising above the button; pop order = bottom → top.
    // tx/ty are the item CENTRES (rules ButtonView is already centre-origin).
    this.items = [
      { view: this.sfx, tx: -130, ty: -GAP, prog: 0 },
      { view: this.music, tx: -130, ty: -GAP * 2, prog: 0 },
      { view: this.rules, tx: -132, ty: -GAP * 3, prog: 0 },
    ];
    for (const it of this.items) {
      it.view.position.set(it.tx, it.ty);
      it.view.scale.set(0);
      it.view.alpha = 0;
      it.view.visible = false;
      this.addChild(it.view);
    }

    this.tick = (t) => this.update(t.deltaMS);
    this.applyState();
    this.disposers.push(this.panel.state.subscribe(() => this.applyState()));
  }

  private applyState(): void {
    this.phase = 0;
    const open = this.panel.isOpen;
    this.eventMode = open ? 'auto' : 'none';
    if (open) for (const it of this.items) it.view.visible = true;
    if (!this.running) {
      this.running = true;
      this.ticker.add(this.tick);
    }
  }

  private update(dt: number): void {
    this.phase += Math.min(dt, 40); // cap stalls so the stagger never gets skipped
    const open = this.panel.isOpen;
    const finalTarget = open ? 1 : 0;
    let settled = true;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      const target = open && this.phase > i * STAGGER ? 1 : 0; // staggered easing target
      it.prog += (target - it.prog) * Math.min(1, dt / (open ? 50 : 80));
      const s = it.prog;
      it.view.scale.set(s);
      it.view.alpha = Math.min(1, s * 1.5);
      it.view.position.set(it.tx, it.ty + (1 - s) * RISE);
      it.view.visible = s > 0.01;
      // settle against the FINAL target so the loop keeps running until every item arrives
      if (Math.abs(it.prog - finalTarget) > 0.01) settled = false;
    }
    if (settled) {
      this.running = false;
      this.ticker.remove(this.tick);
    }
  }

  override dispose(): void {
    if (this.running) {
      this.ticker.remove(this.tick);
      this.running = false;
    }
    this.music.dispose();
    this.sfx.dispose();
    this.rules.dispose();
    super.dispose();
  }
}
