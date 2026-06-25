import { Graphics, Sprite, Rectangle, type Texture, type FederatedPointerEvent } from 'pixi.js';
import { type SliderControl, type OpenUI } from '@open-ui/core';
import { ControlView } from './ControlView';

// Geometry from the provided ScrollBar art (290x60 artboard).
const VB_W = 290;
const VB_H = 60;
const GROOVE_X0 = 63;
const GROOVE_X1 = 263;
const HANDLE_Y = 30;
const HANDLE_R = 12;
const DISPLAY_W = 260;
const S = DISPLAY_W / VB_W;

/**
 * Slider view. With a `trackTexture` (the handle-stripped ScrollBar art) it renders
 * the real gold/white track + draws the moving handle on top. Without one, it draws
 * a clean token-styled slider: a thin track, an accent-filled portion, and a white
 * knob with an accent ring. Origin = track top-left.
 */
export class SliderView extends ControlView {
  private readonly handle = new Graphics();
  private readonly hasTexture: boolean;
  private dragging = false;

  constructor(private readonly slider: SliderControl, ui: OpenUI, trackTexture?: Texture) {
    super(slider, ui);
    this.hasTexture = !!trackTexture;

    const cy = HANDLE_Y * S;
    const x0 = GROOVE_X0 * S;
    const x1 = GROOVE_X1 * S;
    const trackH = 8 * S;

    if (trackTexture) {
      const track = new Sprite(trackTexture);
      track.width = VB_W * S;
      track.height = VB_H * S;
      this.addChild(track);
    } else {
      // A clean rail: muted full track with a soft border (no heavy black outline).
      const t = ui.theme;
      const track = new Graphics()
        .roundRect(x0 - trackH / 2, cy - trackH / 2, x1 - x0 + trackH, trackH, trackH / 2)
        .fill({ color: t.color.surfaceAlt })
        .roundRect(x0 - trackH / 2, cy - trackH / 2, x1 - x0 + trackH, trackH, trackH / 2)
        .stroke({ width: 1, color: t.color.textDim, alpha: 0.35 });
      this.addChild(track);
    }
    this.addChild(this.handle);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, VB_W * S, VB_H * S);
    this.on('pointerdown', this.onDown);
    this.on('globalpointermove', this.onMove);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);

    this.disposers.push(this.slider.value.subscribe(() => this.redraw()));
    this.redraw();
  }

  private redraw(): void {
    const cy = HANDLE_Y * S;
    const x0 = GROOVE_X0 * S;
    const x1 = GROOVE_X1 * S;
    const x = x0 + this.slider.value.get() * (x1 - x0);

    if (this.hasTexture) {
      this.handle.clear().circle(x, cy, HANDLE_R * S).fill({ color: 0xffffff }).stroke({ width: 4 * S, color: 0x000000 });
      return;
    }
    const t = this.ui.theme;
    const trackH = 8 * S;
    const knobR = 11 * S;
    this.handle.clear()
      // filled portion up to the knob
      .roundRect(x0 - trackH / 2, cy - trackH / 2, x - x0 + trackH, trackH, trackH / 2)
      .fill({ color: t.color.accent })
      // clean white knob with an accent ring
      .circle(x, cy, knobR)
      .fill({ color: 0xffffff })
      .circle(x, cy, knobR)
      .stroke({ width: 3, color: t.color.accent });
  }

  private valueFromEvent(e: FederatedPointerEvent): number {
    const svgX = this.toLocal(e.global).x / S;
    return Math.min(1, Math.max(0, (svgX - GROOVE_X0) / (GROOVE_X1 - GROOVE_X0)));
  }

  private readonly onDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.slider.beginDrag();
    this.slider.setNormalized(this.valueFromEvent(e));
  };
  private readonly onMove = (e: FederatedPointerEvent): void => {
    if (this.dragging) this.slider.setNormalized(this.valueFromEvent(e));
  };
  private readonly onUp = (): void => {
    if (this.dragging) {
      this.dragging = false;
      this.slider.endDrag();
    }
  };
}
