import { Container, Text, type Ticker } from 'pixi.js';
import { type ValueDisplay, type OpenUI } from '@open-ui/core';
import { Counter, type CounterOptions } from 'pixi-text-counter';
import { ControlView } from './ControlView';
import { TextCellRenderer } from '../renderers/TextCellRenderer';

const DIGIT_W = 26;
const DIGIT_H = 46;
const FONT_SIZE = 40;

/**
 * View for a value display (balance / bet). Wraps pixi-text-counter's `Counter`
 * (mechanical-reel digit roll) for the number and renders the currency/crypto
 * code as the counter's suffix. Rebuilds when the currency changes (decimals).
 */
export class ValueDisplayView extends ControlView {
  private counter: Counter | undefined;
  private caption: Text | undefined;

  constructor(
    private readonly vd: ValueDisplay,
    ui: OpenUI,
    private readonly ticker: Ticker,
  ) {
    super(vd, ui);
    this.build();
    this.disposers.push(
      this.vd.value.subscribe(() => {
        void this.counter?.setValue(this.vd.minorUnits);
        this.recenter(); // visible-digit count may have changed (e.g. 999 → 1,000)
      }),
      this.vd.currency.subscribe(() => this.rebuild()),
      // re-translate the caption on language switch (guard a post-dispose emit)
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.rebuild();
      }),
    );
  }

  private build(): void {
    const theme = this.ui.theme;
    const cur = this.vd.currency.get();

    if (this.vd.label) {
      // A dimmed tint of the VALUE colour (not the theme's separate dim hue, which
      // can clash with the background) → a clean caption that harmonizes anywhere.
      this.caption = new Text({
        text: this.ui.t(this.vd.label).toUpperCase(),
        style: { fontFamily: theme.type.family, fontSize: 13, fill: theme.color.text, fontWeight: '700', letterSpacing: 2 },
      });
      this.caption.alpha = 0.55;
      this.caption.anchor.set(0.5, 1);
      this.caption.y = -DIGIT_H / 2 - 3;
      this.addChild(this.caption);
    }

    const renderer = new TextCellRenderer({
      style: { fontFamily: theme.type.family, fontSize: FONT_SIZE, fill: theme.color.text, fontWeight: '700' },
      digitWidth: DIGIT_W,
      digitHeight: DIGIT_H,
      // no fillerChar → rolling cells show real digits (crisp, no blur, no blank flicker)
    });

    const opts: CounterOptions = {
      digits: this.vd.digits,
      decimals: cur.decimals,
      decimalChar: cur.decimalChar ?? '.',
      separator: { char: cur.separator ?? ',', every: 3 },
      cellRenderer: renderer,
      digitWidth: DIGIT_W,
      digitHeight: DIGIT_H,
      initialValue: this.vd.minorUnits,
      leadingZeros: { mode: 'hide' },
      blur: { enabled: false },
      ticker: this.ticker,
    };
    if ((cur.position ?? 'suffix') === 'prefix') opts.prefix = `${cur.code} `;
    else opts.suffix = ` ${cur.code}`;

    this.counter = new Counter(opts);
    this.counter.y = -DIGIT_H / 2;
    this.addChild(this.counter);
    this.recenter();
  }

  /** Center the VISIBLE content on the origin. The counter reserves a fixed
   *  `digits` columns, so a short value (e.g. "1.00" in a 9-digit display) sits far
   *  right with blank leading cells — this shifts it so the number (not the empty
   *  reserved space) lines up under the caption. */
  private recenter(): void {
    if (!this.counter) return;
    const dec = this.vd.currency.get().decimals;
    const intCells = Math.max(1, this.vd.digits - dec);
    const visibleInt = Math.max(1, String(Math.floor(Math.abs(this.vd.value.get()))).length);
    const hiddenWidth = Math.max(0, intCells - visibleInt) * DIGIT_W;
    this.counter.x = -this.counter.width / 2 - hiddenWidth / 2;
  }

  private rebuild(): void {
    this.counter?.destroy();
    this.caption?.destroy();
    this.counter = undefined;
    this.caption = undefined;
    this.removeChildren();
    this.build();
  }

  override dispose(): void {
    this.counter?.destroy();
    super.dispose();
  }
}
