import { Container, Graphics, type Ticker } from 'pixi.js';
import { type ReadoutControl, type OpenUI, type ScreenState } from '@open-ui/core';
import { ReadoutView } from './ReadoutView';

export type StatusBarSide = 'top' | 'bottom';

/**
 * A thin, full-width status strip pinned to the top or bottom edge, holding the
 * compliance readouts (net position · RTP · session timer) as inline items. Only
 * the jurisdiction-revealed readouts take a slot, so the bar adapts from 0→3 items
 * (it hides itself when empty). Themed from tokens — a translucent surface strip
 * with a hairline accent edge. A full-screen overlay (OpenUIPixi manages it), so it
 * lays itself out rather than using a per-control anchor.
 */
export class StatusBarView extends Container {
  private readonly bg = new Graphics();
  private readonly items: Array<{ id: string; view: ReadoutView }> = [];
  private screen: ScreenState | undefined;
  private readonly disposers: Array<() => void> = [];

  constructor(
    controls: ReadoutControl[],
    private readonly ui: OpenUI,
    ticker: Ticker,
    private readonly side: StatusBarSide,
  ) {
    super();
    this.zIndex = 60; // above the game + bottom-bar controls, below the menu/modals
    this.addChild(this.bg);
    for (const c of controls) {
      const view = new ReadoutView(c, ui, ticker, { inline: true });
      this.addChild(view);
      this.items.push({ id: c.id, view });
    }
    // re-lay-out when a jurisdiction flag shows/hides one of our readouts
    this.disposers.push(
      this.ui.on('visibilityChanged', ({ id }) => {
        if (this.items.some((it) => it.id === id)) this.relayout();
      }),
    );
  }

  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.relayout();
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    const W = s.width;
    const H = s.height;
    const t = this.ui.theme;
    const scale = Math.max(0.7, Math.min(1.4, s.scale));
    const barH = Math.round(44 * scale);
    const y = this.side === 'top' ? 0 : H - barH;
    this.position.set(0, 0);

    const visible = this.items.filter((it) => !this.ui.hidden.has(it.id));
    for (const it of this.items) it.view.visible = !this.ui.hidden.has(it.id);

    // hide the whole strip when no readout is active
    this.bg.clear();
    this.visible = visible.length > 0;
    if (!visible.length) return;

    const edgeY = this.side === 'top' ? barH - 1 : y;
    this.bg
      .rect(0, y, W, barH)
      .fill({ color: t.color.surface, alpha: 0.82 })
      .rect(0, edgeY, W, 1)
      .fill({ color: t.color.accent, alpha: 0.5 });

    const n = visible.length;
    const cy = y + barH / 2;
    // reserve the right end for the edge icons (mute/fullscreen) when on the top edge
    const leftPad = 14 * scale;
    const rightReserve = this.side === 'top' ? 150 * scale : 14 * scale;
    const usableW = Math.max(160, W - leftPad - rightReserve);
    visible.forEach((it, i) => {
      it.view.position.set(leftPad + usableW * ((i + 0.5) / n), cy);
      it.view.scale.set(scale);
    });
  }

  dispose(): void {
    for (const it of this.items) it.view.dispose();
    this.items.length = 0;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
