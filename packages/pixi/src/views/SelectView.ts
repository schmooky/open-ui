import { Container, Graphics, Text, Rectangle, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { type SelectControl, type OpenUI, type Transition } from '@open-ui/core';
import { ControlView } from './ControlView';
import { Tweener } from '../tween';

export interface SelectViewOptions {
  width?: number;
  height?: number;
  /**
   * An UNCLIPPED layer (above any scroll mask) to render the open dropdown list
   * into. When given, tapping opens a real list; without it, tapping cycles.
   */
  dropdownLayer?: Container;
}

/**
 * Select view: a pill showing the caption + current value + a chevron. With a
 * `dropdownLayer`, tapping opens a real dropdown LIST (rendered in that unclipped
 * layer so a scroll mask never clips it); choosing a row selects it. Without one,
 * it falls back to cycle-on-tap. Token-styled; the headless logic is SelectControl.
 */
export class SelectView extends ControlView {
  private readonly art = new Container();
  private readonly bg = new Graphics();
  private readonly chevron = new Graphics();
  private readonly captionText: Text;
  private readonly valueText: Text;
  private readonly tween: Tweener;
  private readonly w: number;
  private readonly h: number;
  private readonly dropdownLayer: Container | undefined;
  private dropdown: Container | undefined;

  constructor(private readonly select: SelectControl, ui: OpenUI, ticker: Ticker, opts: SelectViewOptions = {}) {
    super(select, ui);
    this.tween = new Tweener(ticker);
    this.w = opts.width ?? 240;
    this.h = opts.height ?? 56;
    this.dropdownLayer = opts.dropdownLayer;
    const t = ui.theme;

    this.captionText = new Text({ text: select.caption ?? '', style: { fontFamily: t.type.family, fontSize: 16, fill: t.color.textDim, fontWeight: '600' } });
    this.captionText.anchor.set(0, 0.5);
    this.valueText = new Text({ text: select.optionLabel, style: { fontFamily: t.type.family, fontSize: 20, fill: t.color.text, fontWeight: '700' } });
    this.valueText.anchor.set(1, 0.5);

    this.art.addChild(this.bg, this.captionText, this.valueText, this.chevron);
    this.addChild(this.art);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-this.w / 2, -this.h / 2, this.w, this.h);
    this.on('pointerup', this.onUp);

    this.disposers.push(
      this.select.index.subscribe(() => this.redraw()),
      this.select.state.subscribe(() => { this.redraw(); this.syncDropdown(); }),
      this.select.onTransition((tr) => this.play(tr)),
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.redraw();
      }),
    );
    this.redraw();
  }

  private readonly onUp = (): void => {
    if (!this.select.interactable) return;
    if (this.dropdownLayer) this.select.isOpen ? this.select.closeList() : this.select.openList();
    else this.select.cycle();
  };

  private syncDropdown(): void {
    if (!this.dropdownLayer) return;
    if (this.select.isOpen) this.showDropdown();
    else this.hideDropdown();
  }

  private showDropdown(): void {
    this.hideDropdown();
    const layer = this.dropdownLayer;
    if (!layer) return;
    const t = this.ui.theme;
    const w = Math.max(this.w, 220);
    const rowH = 46;
    const opts = this.select.options;
    const listH = opts.length * rowH + 8;

    const panel = new Container();
    panel.zIndex = 1;
    const backdrop = new Graphics().rect(-6000, -6000, 12000, 12000).fill({ color: 0x000000, alpha: 0.001 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', () => this.select.closeList());
    panel.addChild(backdrop);

    const list = new Container();
    list.addChild(new Graphics().roundRect(-w / 2, 0, w, listH, 14).fill({ color: t.color.surface }).stroke({ width: 2, color: t.color.accent }));
    opts.forEach((o, i) => {
      const selected = i === this.select.index.get();
      const cy = 4 + i * rowH + rowH / 2;
      const row = new Container();
      if (selected) row.addChild(new Graphics().roundRect(-w / 2 + 5, 4 + i * rowH, w - 10, rowH, 9).fill({ color: t.color.accent }));
      const label = new Text({ text: this.ui.t(o.label), style: { fontFamily: t.type.family, fontSize: 18, fill: selected ? t.color.accentText : t.color.text, fontWeight: '700' } });
      label.anchor.set(0, 0.5);
      label.position.set(-w / 2 + 20, cy);
      row.addChild(label);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.hitArea = new Rectangle(-w / 2, 4 + i * rowH, w, rowH);
      row.on('pointertap', (e: FederatedPointerEvent) => { e.stopPropagation(); this.select.choose(o.value); });
      list.addChild(row);
    });
    panel.addChild(list);

    // Position just below the pill, clamped so the list stays on screen.
    const g = this.toGlobal({ x: 0, y: this.h / 2 + 6 });
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const py = listH > screenH - 16 ? 8 : Math.min(g.y, screenH - 8 - listH);
    list.position.set(g.x, Math.max(8, py));
    layer.addChild(panel);
    this.dropdown = panel;
  }

  private hideDropdown(): void {
    if (this.dropdown && !this.dropdown.destroyed) this.dropdown.destroy({ children: true });
    this.dropdown = undefined;
  }

  private redraw(): void {
    const t = this.ui.theme;
    const disabled = this.select.current === 'disabled';
    const open = this.select.isOpen;
    const w = this.w;
    const h = this.h;
    const edge = disabled ? t.color.disabled : t.color.accent;

    this.bg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: t.color.surfaceAlt }).stroke({ width: 3, color: edge });

    this.captionText.text = this.ui.t(this.select.caption ?? '');
    this.captionText.position.set(-w / 2 + 18, 0);
    this.captionText.style.fill = t.color.textDim;

    this.valueText.text = this.ui.t(this.select.optionLabel);
    this.valueText.position.set(w / 2 - 32, 0);
    this.valueText.style.fill = disabled ? t.color.textDim : t.color.text;

    // chevron points down when closed, up when the list is open
    const cx = w / 2 - 16;
    const dir = open ? -1 : 1;
    this.chevron.clear()
      .moveTo(cx - 5, -4 * dir)
      .lineTo(cx, 4 * dir)
      .lineTo(cx + 5, -4 * dir)
      .stroke({ width: 3, color: edge, cap: 'round', join: 'round' });

    this.art.alpha = disabled ? 0.6 : 1;
  }

  private play(tr: Transition | undefined): void {
    this.animating = true;
    void this.tween.run(this.art, tr, this.ui.theme).then(() => {
      this.animating = false;
    });
  }

  override dispose(): void {
    this.hideDropdown();
    this.tween.stop();
    super.dispose();
  }
}
