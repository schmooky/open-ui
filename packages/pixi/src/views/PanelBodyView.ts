import { Container, Graphics, type Ticker } from 'pixi.js';
import { type OpenUI, type PanelControl, type Control, type BlockSpec } from '@open-ui/core';
import { ControlView } from './ControlView';
import { buildBlockColumn, type ControlViewFactory } from './blockColumn';

export interface PanelBodyOptions {
  width?: number;
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
}

/**
 * A small, CENTERED panel body (the settings popover / declarative panels): walks
 * a `BlockSpec[]` via the shared {@link buildBlockColumn} renderer, draws a branded
 * card behind it, and follows the PanelControl's open/closed state. A `modal`
 * variant also gets a dismissable backdrop. Text re-renders on `ui.locale` change.
 * (The big scrollable menu uses {@link MenuView}, which shares the same renderer.)
 */
export class PanelBodyView extends ControlView {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly content = new Container();
  private childViews: ControlView[] = [];
  private readonly bodyW: number;

  constructor(
    private readonly panelControl: PanelControl,
    private readonly controls: Control[],
    private readonly blocks: BlockSpec[],
    ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: PanelBodyOptions = {},
  ) {
    super(panelControl, ui);
    this.bodyW = opts.width ?? 360;

    this.addChild(this.backdrop, this.card, this.content);
    this.rebuild();
    this.applyVisibility();

    this.disposers.push(
      this.panelControl.state.subscribe(() => this.applyVisibility()),
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.rebuild();
      }),
    );

    if (this.panelControl.variant === 'modal') {
      this.backdrop.eventMode = 'static';
      this.backdrop.on('pointertap', () => this.panelControl.closePanel());
    }
  }

  private rebuild(): void {
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    // Destroy direct children (wraps/static nodes) WITHOUT children:true so the
    // already-disposed control views aren't re-destroyed (matches the prior code).
    for (const child of this.content.removeChildren()) child.destroy();

    const col = buildBlockColumn(this.blocks, this.controls, this.ui, this.ticker, this.bodyW, { controlSkins: this.opts.controlSkins });
    this.childViews = col.views;
    this.content.addChild(...col.content.removeChildren());
    this.content.position.set(0, -col.height / 2);
    this.drawChrome(this.bodyW, col.height);
  }

  private drawChrome(width: number, height: number): void {
    const t = this.ui.theme;
    this.card.clear()
      .roundRect(-width / 2, -height / 2, width, height, t.radius.card)
      .fill({ color: t.color.surface })
      .stroke({ width: 3, color: t.color.accent });

    this.backdrop.clear();
    if (this.panelControl.variant === 'modal') {
      this.backdrop.rect(-3000, -3000, 6000, 6000).fill({ color: 0x000000, alpha: 0.6 });
    }
  }

  private applyVisibility(): void {
    const open = this.panelControl.isOpen;
    this.visible = open;
    this.eventMode = open ? 'auto' : 'none';
  }

  override dispose(): void {
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    super.dispose();
  }
}
