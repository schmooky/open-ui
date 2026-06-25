import { Container, Graphics, Text, Circle, type Ticker } from 'pixi.js';
import { type StepperControl, type OpenUI, type Theme } from '@open-ui/core';
import { ControlView } from './ControlView';

/**
 * Stepper view for a panel body: a `[−] value [+]` row (optionally captioned),
 * driving the StepperControl. The ± buttons dim + go non-interactive at the ends
 * (canDec/canInc). Token-styled, locale-reactive.
 */
export class StepperView extends ControlView {
  private readonly minus = new Graphics();
  private readonly plus = new Graphics();
  private readonly valueText: Text;
  private readonly captionText?: Text;

  constructor(private readonly stepper: StepperControl, ui: OpenUI, _ticker: Ticker) {
    super(stepper, ui);
    const t = ui.theme;

    if (stepper.label) {
      this.captionText = new Text({
        text: ui.t(stepper.label),
        style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.textDim, fontWeight: '600' },
      });
      this.captionText.anchor.set(0.5);
      this.captionText.position.set(0, -22);
      this.addChild(this.captionText);
    }

    this.valueText = new Text({
      text: '',
      style: { fontFamily: t.type.family, fontSize: 20, fill: t.color.text, fontWeight: '700' },
    });
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, this.captionText ? 6 : 0);

    this.minus.position.set(-64, this.valueText.y);
    this.plus.position.set(64, this.valueText.y);
    this.minus.hitArea = new Circle(0, 0, 20);
    this.plus.hitArea = new Circle(0, 0, 20);
    this.minus.on('pointerup', () => this.stepper.dec());
    this.plus.on('pointerup', () => this.stepper.inc());

    this.addChild(this.minus, this.valueText, this.plus);

    this.disposers.push(
      this.stepper.index.subscribe(() => this.redraw()),
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.redraw();
      }),
    );
    this.redraw();
  }

  private fmt(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  private redraw(): void {
    const t = this.ui.theme;
    if (this.captionText) this.captionText.text = this.ui.t(this.stepper.label ?? '');
    this.valueText.text = this.fmt(this.stepper.value);
    drawStepButton(this.minus, 'minus', this.stepper.canDec, t);
    drawStepButton(this.plus, 'plus', this.stepper.canInc, t);
  }
}

function drawStepButton(g: Graphics, kind: 'minus' | 'plus', enabled: boolean, t: Theme): void {
  const col = enabled ? t.color.accent : t.color.disabled;
  g.clear();
  g.circle(0, 0, 18).fill({ color: t.color.surfaceAlt }).stroke({ width: 3, color: col });
  g.moveTo(-7, 0).lineTo(7, 0).stroke({ width: 3, color: col, cap: 'round' });
  if (kind === 'plus') g.moveTo(0, -7).lineTo(0, 7).stroke({ width: 3, color: col, cap: 'round' });
  g.alpha = enabled ? 1 : 0.5;
  g.eventMode = enabled ? 'static' : 'none';
  g.cursor = enabled ? 'pointer' : 'default';
}
