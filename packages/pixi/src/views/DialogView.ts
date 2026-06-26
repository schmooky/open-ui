import { Container, Graphics, Text, Rectangle, type Ticker } from 'pixi.js';
import { type PanelControl, type OpenUI, type BlockSpec, type Signal, type ScreenState, type NoticeAction } from '@open-ui/core';
import { ControlView } from './ControlView';
import { buildBlockColumn, type ControlViewFactory } from './blockColumn';

export interface DialogViewOptions {
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /** Max card width in px. Default 520. */
  maxWidth?: number;
}

const INSET = 24;
const BTN_H = 50;
const BTN_GAP = 12;
const ROW_GAP = 16;

interface BuiltButton {
  node: Container;
  bg: Graphics;
  width: number;
  variant: 'primary' | 'secondary';
}

/**
 * A centered, auto-sized modal rendered in the SAME style as the unified menu — the
 * accent-stroked card on a dimmed backdrop, the same {@link buildBlockColumn}
 * renderer — so notices/errors are themed for free. Content comes from a
 * `Signal<BlockSpec[]>` and the footer buttons from a `Signal<NoticeAction[]>`;
 * every label runs through `ui.t`, so the host's exact text or i18n keys are used.
 * The Stake Engine error/notice surface (`showError` / `showRgsError`).
 */
export class DialogView extends ControlView {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly closeBtn = new Container();
  private readonly content = new Container();
  private readonly maskG = new Graphics();
  private readonly buttons = new Container();
  private childViews: ControlView[] = [];
  private screen: ScreenState | undefined;
  private readonly maxWidth: number;

  constructor(
    private readonly panel: PanelControl,
    private readonly blocks: Signal<BlockSpec[]>,
    private readonly actions: Signal<NoticeAction[]>,
    ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: DialogViewOptions = {},
  ) {
    super(panel, ui);
    this.zIndex = 130; // above the menu (120)
    this.maxWidth = opts.maxWidth ?? 520;

    this.backdrop.eventMode = 'static';
    // A blocking/fatal notice can't be tapped away — only `hideNotice` (code) closes it.
    this.backdrop.on('pointertap', () => {
      if (!this.ui.noticeBlocking.get()) this.panel.closePanel();
    });
    this.buildClose();

    this.content.mask = this.maskG;
    this.addChild(this.backdrop, this.card, this.content, this.maskG, this.buttons, this.closeBtn);

    this.applyOpen(this.panel.isOpen);
    this.disposers.push(
      this.panel.state.subscribe(() => this.applyOpen(this.panel.isOpen)),
      // hide the ✕ when the open notice is blocking (re-renders on toggle)
      this.ui.noticeBlocking.subscribe(() => {
        this.closeBtn.visible = !this.ui.noticeBlocking.get();
      }),
      this.blocks.subscribe(() => {
        if (!this.destroyed) this.relayout();
      }),
      this.actions.subscribe(() => {
        if (!this.destroyed) this.relayout();
      }),
      this.ui.locale.subscribe(() => {
        if (!this.destroyed) this.relayout();
      }),
    );
  }

  private buildClose(): void {
    const t = this.ui.theme;
    const r = 18;
    const bg = new Graphics().circle(0, 0, r).fill({ color: t.color.surfaceAlt }).stroke({ width: 2, color: t.color.textDim });
    const x = new Graphics().moveTo(-6, -6).lineTo(6, 6).moveTo(6, -6).lineTo(-6, 6).stroke({ width: 3, color: t.color.text });
    this.closeBtn.addChild(bg, x);
    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.hitArea = new Rectangle(-r, -r, r * 2, r * 2);
    this.closeBtn.on('pointertap', () => this.panel.closePanel());
  }

  override applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.position.set(0, 0);
    this.scale.set(1);
    this.relayout();
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    if (!this.panel.isOpen) return;
    const W = s.width;
    const H = s.height;
    const t = this.ui.theme;

    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    for (const ch of this.content.removeChildren()) ch.destroy();

    const cardW = Math.min(W - 48, this.maxWidth);
    const innerW = cardW - INSET * 2;
    const col = buildBlockColumn(this.blocks.get(), [], this.ui, this.ticker, innerW, { controlSkins: this.opts.controlSkins });
    this.childViews = col.views;
    const kids = col.content.removeChildren();
    if (kids.length) this.content.addChild(...kids);
    const contentH = col.height;

    const buttonsH = this.buildButtons(innerW);

    const wantH = contentH + (buttonsH ? ROW_GAP + buttonsH + INSET : INSET);
    const cardH = Math.min(H - 48, wantH);
    const cx = (W - cardW) / 2;
    const cy = (H - cardH) / 2;

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.62 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);
    this.card.clear().roundRect(cx, cy, cardW, cardH, t.radius.card).fill({ color: t.color.surface }).stroke({ width: 2, color: t.color.accent });

    const bodyH = cardH - (buttonsH ? ROW_GAP + buttonsH + INSET : INSET);
    this.content.x = cx + cardW / 2;
    this.content.y = cy;
    this.maskG.clear().rect(cx, cy, cardW, Math.max(0, bodyH)).fill({ color: 0xffffff });

    this.buttons.position.set(cx + cardW / 2, cy + cardH - INSET / 2 - buttonsH / 2);
    this.closeBtn.position.set(cx + cardW - 20, cy + 20);
  }

  /** Build the footer buttons from `noticeActions` into a centered row (shrunk to
   *  fit if needed). Returns the row height (0 when there are no actions). */
  private buildButtons(innerW: number): number {
    for (const b of this.buttons.removeChildren()) b.destroy();
    const acts = this.ui.noticeActions.get();
    if (!acts.length) return 0;

    const made = acts.map((a, i) => this.makeButton(a, a.variant ?? (i === 0 ? 'primary' : 'secondary'), innerW));
    let total = made.reduce((sum, m) => sum + m.width, 0) + BTN_GAP * (made.length - 1);
    if (total > innerW) {
      const scale = innerW / total;
      for (const m of made) {
        m.width *= scale;
        this.drawButton(m.bg, m.variant, m.width);
        m.node.hitArea = new Rectangle(-m.width / 2, -BTN_H / 2, m.width, BTN_H);
      }
      total = made.reduce((sum, m) => sum + m.width, 0) + BTN_GAP * (made.length - 1);
    }
    let x = -total / 2;
    for (const m of made) {
      m.node.position.set(x + m.width / 2, 0);
      x += m.width + BTN_GAP;
      this.buttons.addChild(m.node);
    }
    return BTN_H;
  }

  private makeButton(action: NoticeAction, variant: 'primary' | 'secondary', innerW: number): BuiltButton {
    const t = this.ui.theme;
    const node = new Container();
    const bg = new Graphics();
    const label = new Text({
      text: this.ui.t(action.label),
      style: { fontFamily: t.type.family, fontSize: 18, fontWeight: '800', fill: variant === 'primary' ? t.color.accentText : t.color.text, letterSpacing: 0.5 },
    });
    label.anchor.set(0.5);
    node.addChild(bg, label);
    const width = Math.min(innerW, Math.max(140, label.width + 56));
    this.drawButton(bg, variant, width);
    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.hitArea = new Rectangle(-width / 2, -BTN_H / 2, width, BTN_H);
    node.on('pointertap', () => {
      action.onSelect?.();
      if (action.emit) this.ui.bus.emit('buttonActivated', { id: action.emit });
      if (!action.keepOpen) this.panel.closePanel();
    });
    return { node, bg, width, variant };
  }

  private drawButton(bg: Graphics, variant: 'primary' | 'secondary', width: number): void {
    const t = this.ui.theme;
    bg.clear();
    if (variant === 'primary') {
      bg.roundRect(-width / 2, -BTN_H / 2, width, BTN_H, BTN_H / 2).fill({ color: t.color.accent });
    } else {
      bg.roundRect(-width / 2, -BTN_H / 2, width, BTN_H, BTN_H / 2).fill({ color: t.color.surfaceAlt }).stroke({ width: 2, color: t.color.accent });
    }
  }

  private applyOpen(open: boolean): void {
    this.visible = open;
    this.eventMode = open ? 'static' : 'none';
    this.closeBtn.visible = !this.ui.noticeBlocking.get(); // no ✕ on a blocking notice
    if (open) this.relayout();
  }

  override dispose(): void {
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    super.dispose();
  }
}
