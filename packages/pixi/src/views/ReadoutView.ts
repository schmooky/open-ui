import { Text, type Ticker } from 'pixi.js';
import { type ReadoutControl, type OpenUI, formatAmount } from '@open-slot-ui/core';
import { ControlView } from './ControlView';

const CAP_DY = -20;

export interface ReadoutViewOptions {
  /** Compact one-line layout (`CAPTION  value`) for the status bar. Default false (stacked). */
  inline?: boolean;
  /** Force black-and-white text (white on a dark bar), ignoring the theme accent/text hue. */
  mono?: boolean;
  /** Single left-aligned `Label: value` line (the Figma top-corner block). */
  prefix?: boolean;
  /** Explicit text colour (else the theme text colour). Lets a light-bg host darken it. */
  fill?: string;
}

/** Seconds → "M:SS" or "H:MM:SS". */
function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * A compact, non-interactive readout for the Stake Engine jurisdiction `display*`
 * elements — RTP, net position, session timer. Two layouts: `stacked` (a dim
 * uppercase caption over a bold value — for a screen corner) and `inline`
 * (`CAPTION  value` on one line, centered on the seam — for the status bar). `mono`
 * forces white text for the dark b&w status bar. The `'duration'` kind advances
 * itself off the shared ticker while running. Net position shows an explicit +/-.
 */
export class ReadoutView extends ControlView {
  private readonly caption?: Text;
  private readonly valueText: Text;
  private readonly tick?: (t: Ticker) => void;
  private readonly prefix: boolean;

  constructor(private readonly ro: ReadoutControl, ui: OpenUI, private readonly ticker: Ticker, opts: ReadoutViewOptions = {}) {
    super(ro, ui);
    const t = ui.theme;
    const inline = opts.inline ?? false;
    this.prefix = opts.prefix ?? false;
    const fill = opts.fill ?? (opts.mono ? '#ffffff' : t.color.text);

    // Figma top-corner block: one left-aligned `Label: value` line per readout. Sized
    // for legibility and given a soft dark shadow so the white text stays readable on
    // ANY background (light or dark), not just over the corner vignette.
    if (this.prefix) {
      this.valueText = new Text({
        text: '',
        style: {
          fontFamily: t.type.family,
          fontSize: 18,
          fill: opts.fill ?? '#ffffff',
          fontWeight: '600',
          dropShadow: { color: 0x000000, alpha: 0.7, blur: 4, distance: 0, angle: 0 },
        },
      });
      this.valueText.alpha = opts.fill ? 1 : 0.92;
      this.valueText.anchor.set(0, 0);
      this.addChild(this.valueText);
      this.disposers.push(
        this.ro.value.subscribe(() => this.render()),
        this.ui.locale.subscribe(() => { if (!this.destroyed) this.render(); }),
      );
      if (this.ro.currency) this.disposers.push(this.ro.currency.subscribe(() => this.render()));
      if (this.ro.kind === 'duration') {
        this.tick = (tk) => this.ro.tick(tk.deltaMS / 1000);
        this.ticker.add(this.tick);
      }
      this.render();
      return;
    }

    if (ro.label) {
      this.caption = new Text({
        text: ui.t(ro.label).toUpperCase(),
        style: { fontFamily: t.type.family, fontSize: 12, fill, fontWeight: '700', letterSpacing: inline ? 0.8 : 2 },
      });
      this.caption.alpha = inline ? 0.65 : 0.55;
      if (inline) {
        this.caption.anchor.set(1, 0.5); // ends just left of the seam
        this.caption.position.set(-7, 0);
      } else {
        this.caption.anchor.set(0.5, 1);
        this.caption.y = CAP_DY;
      }
      this.addChild(this.caption);
    }

    this.valueText = new Text({ text: '', style: { fontFamily: t.type.family, fontSize: inline ? 20 : 26, fill, fontWeight: '800' } });
    if (inline) {
      this.valueText.anchor.set(0, 0.5); // starts just right of the seam
      this.valueText.position.set(this.caption ? 7 : 0, 0);
    } else {
      this.valueText.anchor.set(0.5, 0.5);
    }
    this.addChild(this.valueText);

    this.disposers.push(
      this.ro.value.subscribe(() => this.render()),
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        if (this.caption && this.ro.label) this.caption.text = this.ui.t(this.ro.label).toUpperCase();
      }),
    );
    if (this.ro.currency) this.disposers.push(this.ro.currency.subscribe(() => this.render()));

    if (this.ro.kind === 'duration') {
      this.tick = (tk) => this.ro.tick(tk.deltaMS / 1000);
      this.ticker.add(this.tick);
    }
    this.render();
  }

  private render(): void {
    const v = this.ro.value.get();
    let text: string;
    switch (this.ro.kind) {
      case 'currency':
        text = this.ro.currency ? formatAmount(v, this.ro.currency.get(), { signed: this.ro.signed }) : String(v);
        break;
      case 'percent':
        text = `${v.toFixed(this.ro.decimals)}%`;
        break;
      case 'duration':
        text = fmtDuration(v);
        break;
      default:
        text = String(v);
    }
    this.valueText.text = this.prefix && this.ro.label ? `${this.ui.t(this.ro.label)}: ${text}` : text;
  }

  override dispose(): void {
    if (this.tick) this.ticker.remove(this.tick);
    super.dispose();
  }
}
