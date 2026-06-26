import { Container, Text, type Ticker } from 'pixi.js';
import { type ValueDisplay, type OpenUI, displayDigits, valueFitMaxWidth } from '@open-ui/core';
import { Counter, type CounterOptions, type GsapLike } from 'pixi-text-counter';
import { ControlView } from './ControlView';
import { TextCellRenderer } from '../renderers/TextCellRenderer';

const DIGIT_W = 26;
const DIGIT_H = 46;
const FONT_SIZE = 40;
/** Fixed fit budget floor (columns): values up to ~this width render full size; wider
 *  ones scale down so the readout never spills toward its neighbours. */
const FIT_BUDGET_COLS = 9;

type Side = 'left' | 'right' | 'center';

/**
 * View for a value display (balance / bet). Wraps pixi-text-counter's `Counter`
 * (mechanical-reel digit roll) for the number with the currency symbol/code as a
 * tight prefix/suffix. The odometer is sized to the VALUE (no hidden leading-zero
 * reserve), so the symbol hugs the number and large balances never clamp; it grows
 * when the value grows. Rebuilds on currency / locale change.
 */
export class ValueDisplayView extends ControlView {
  private counter: Counter | undefined;
  private caption: Text | undefined;

  constructor(
    private readonly vd: ValueDisplay,
    ui: OpenUI,
    private readonly ticker: Ticker,
    /** Host `gsap` — when present, the counter auto-downscales wide values to fit
     *  (Charter B5: no hard gsap dep; the host passes it). */
    private readonly fitGsap?: GsapLike,
  ) {
    super(vd, ui);
    this.build();
    this.disposers.push(
      this.vd.value.subscribe(() => {
        if (this.destroyed) return;
        const cur = this.vd.currency.get();
        const needed = displayDigits(this.vd.get(), this.vd.digits, cur.decimals);
        // Re-size the odometer to the new magnitude (grow OR shrink) so it always fits
        // tightly — the symbol keeps hugging the number and a larger value never clamps.
        // Only when the digit count actually changes (a power-of-ten crossing), not every
        // roll. GROW: seed from the current value (it fits the wider odometer → a true
        // roll). SHRINK: seed at the TARGET — the old, larger value wouldn't fit the
        // narrower odometer and would snap to all-nines, so we skip that wrong intermediate.
        if (this.counter && needed !== this.counter.digits) {
          const from = needed > this.counter.digits ? this.counter.getValue() : this.vd.minorUnits;
          this.buildCounter(needed, from);
        }
        void this.counter?.setValue(this.vd.minorUnits);
      }),
      this.vd.currency.subscribe(() => {
        if (!this.destroyed) this.rebuild();
      }),
      // re-translate the caption on language switch (guard a post-dispose emit)
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.rebuild();
      }),
    );
  }

  private side(): Side {
    const a = this.vd.layout.anchor;
    return a.includes('left') ? 'left' : a.includes('right') ? 'right' : 'center';
  }

  private build(): void {
    const theme = this.ui.theme;
    const side = this.side();

    if (this.vd.label) {
      // A dimmed tint of the VALUE colour (not the theme's separate dim hue, which
      // can clash with the background) → a clean caption that harmonizes anywhere.
      this.caption = new Text({
        text: this.ui.t(this.vd.label).toUpperCase(),
        style: { fontFamily: theme.type.family, fontSize: 13, fill: theme.color.text, fontWeight: '700', letterSpacing: 2 },
      });
      this.caption.alpha = 0.55;
      this.caption.anchor.set(side === 'left' ? 0 : side === 'right' ? 1 : 0.5, 1);
      this.caption.y = -DIGIT_H / 2 - 3;
      this.addChild(this.caption);
    }

    const cur = this.vd.currency.get();
    this.buildCounter(displayDigits(this.vd.get(), this.vd.digits, cur.decimals), this.vd.minorUnits);
  }

  /** (Re)create the rolling counter sized to `total` columns, starting at `fromMinor`. */
  private buildCounter(total: number, fromMinor: number): void {
    this.counter?.destroy();
    const theme = this.ui.theme;
    const cur = this.vd.currency.get();
    const side = this.side();

    const renderer = new TextCellRenderer({
      style: { fontFamily: theme.type.family, fontSize: FONT_SIZE, fill: theme.color.text, fontWeight: '700' },
      digitWidth: DIGIT_W,
      digitHeight: DIGIT_H,
      // no fillerChar → rolling cells show real digits (crisp, no blur, no blank flicker)
    });

    const opts: CounterOptions = {
      digits: total,
      decimals: cur.decimals,
      decimalChar: cur.decimalChar ?? '.',
      separator: { char: cur.separator ?? ',', every: 3 },
      cellRenderer: renderer,
      digitWidth: DIGIT_W,
      digitHeight: DIGIT_H,
      initialValue: fromMinor,
      // Tight sizing means the value fills its columns — leading-zero hide only ever
      // trims a digit or two after a grow, never a permanent reserve gap.
      leadingZeros: { mode: 'hide' },
      blur: { enabled: false },
      ticker: this.ticker,
    };
    // Affix = the symbol (when display:'symbol' and one is set) else the code. Tight
    // sizing keeps it adjacent to the number: "$1,234.50" / "1,234.50€" / "100,000 SATS".
    const symbolMode = cur.display === 'symbol' && !!cur.symbol;
    const affix = symbolMode ? (cur.symbol as string) : cur.code;
    if ((cur.position ?? 'suffix') === 'prefix') opts.prefix = symbolMode ? affix : `${affix} `;
    else opts.suffix = symbolMode ? affix : ` ${affix}`;

    // A very large value (whale crypto, big SATS counts) is scaled down to a fixed
    // budget so it never spills into its neighbours; normal magnitudes render full size.
    if (this.fitGsap) {
      opts.fit = {
        gsap: this.fitGsap,
        maxWidth: valueFitMaxWidth(Math.max(this.vd.digits, FIT_BUDGET_COLS), DIGIT_W),
        minScale: 0.5,
        anchor: side, // left→0 · right→fullWidth · center→fullWidth/2
      };
    }

    this.counter = new Counter(opts);
    this.counter.y = -DIGIT_H / 2;
    // With `fit`, the counter pivots at its anchored point (left edge / right edge /
    // centre), so x=0 pins THAT point to the control origin and stays put at any fit
    // scale. Without fit there is no pivot, so shift right/centre left by the width.
    if (this.fitGsap) {
      this.counter.x = 0;
    } else {
      this.counter.x = side === 'left' ? 0 : side === 'right' ? -this.counter.width : -this.counter.width / 2;
    }
    this.addChild(this.counter);
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
