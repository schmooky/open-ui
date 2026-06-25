import { Container, Graphics, Text, Rectangle, type Texture, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { type PanelControl, type ButtonControl, type OpenUI, type ScreenState, type Theme } from '@open-ui/core';
import { ControlView } from './ControlView';
import { ButtonView } from './ButtonView';

export type InfoContentBuilder = (theme: Theme, width: number) => Container;

export interface PanelViewOptions {
  closeTexture?: Texture;
  content?: InfoContentBuilder;
}

// The modal is an intentionally LIGHT surface (per the design), distinct from the dark HUD theme.
const INK = 0x15171c;
const CARD = 0xffffff;
const HEADER_BG = 0x20242b;
const PAD = 16;
const HEADER_H = 56;
const MAX_W = 600;

/**
 * Full-screen modal: dim backdrop + dark header (title + ✕ close) + a white,
 * scrollable content card. Content is built dynamically (so it scrolls and is
 * data-driven). Faithful to the provided Mobile Rules design.
 */
export class PanelView extends ControlView {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly headerBg = new Graphics();
  private readonly title: Text;
  private readonly viewport = new Container();
  private readonly maskG = new Graphics();
  private readonly catcher = new Graphics();
  private readonly close: ButtonView;
  private content: Container | undefined;
  private builtWidth = -1;
  private scrollY = 0;
  private contentH = 0;
  private viewportH = 0;
  private dragging = false;
  private lastY = 0;
  private wheelHandler: ((e: WheelEvent) => void) | undefined;

  constructor(
    private readonly panel: PanelControl,
    closeBtn: ButtonControl,
    ui: OpenUI,
    ticker: Ticker,
    private readonly opts: PanelViewOptions = {},
  ) {
    super(panel, ui);
    this.zIndex = 100;

    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.panel.closePanel());

    this.title = new Text({
      text: panel.title ?? '',
      style: { fontFamily: ui.theme.type.family, fontSize: 22, fill: 0xffffff, fontWeight: '800', letterSpacing: 1 },
    });
    this.title.anchor.set(0.5);

    this.viewport.mask = this.maskG;
    this.catcher.eventMode = 'static';
    this.catcher.on('pointerdown', this.onDown);
    this.catcher.on('globalpointermove', this.onMove);
    this.catcher.on('pointerup', this.onUp);
    this.catcher.on('pointerupoutside', this.onUp);

    this.close = new ButtonView(closeBtn, ui, ticker, { iconTexture: opts.closeTexture, iconTarget: 44, glyph: 'close', radius: 24 });

    this.addChild(this.backdrop, this.card, this.viewport, this.maskG, this.catcher, this.headerBg, this.title, this.close);

    this.applyOpen(this.panel.isOpen);
    this.disposers.push(this.panel.state.subscribe(() => this.applyOpen(this.panel.isOpen)));
  }

  override applyLayout(screen: ScreenState): void {
    const W = screen.width;
    const H = screen.height;
    this.position.set(0, 0);
    this.scale.set(1);

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    const cardW = Math.min(W - PAD * 2, MAX_W);
    const cx = (W - cardW) / 2;
    const hy = PAD;
    this.headerBg.clear().roundRect(cx, hy, cardW, HEADER_H, HEADER_H / 2).fill({ color: HEADER_BG });
    this.title.position.set(W / 2, hy + HEADER_H / 2);
    this.close.position.set(cx + cardW - HEADER_H / 2, hy + HEADER_H / 2);

    const cardY = hy + HEADER_H + 12;
    const cardH = H - cardY - PAD;
    this.card.clear().roundRect(cx, cardY, cardW, cardH, 22).fill({ color: CARD });

    const inset = 20;
    const vpX = cx + inset;
    const vpY = cardY + inset;
    const vpW = cardW - inset * 2;
    const vpH = cardH - inset * 2;
    this.viewport.position.set(vpX, vpY);
    this.viewportH = vpH;
    this.maskG.clear().rect(vpX, vpY, vpW, vpH).fill({ color: 0xffffff });
    this.catcher.clear().rect(vpX, vpY, vpW, vpH).fill({ color: 0xffffff, alpha: 0.0001 });

    // (re)build content to the current viewport width
    if (Math.abs(vpW - this.builtWidth) > 1) {
      this.content?.destroy({ children: true });
      this.content = this.opts.content?.(this.ui.theme, vpW) ?? this.fallback(vpW);
      this.viewport.addChild(this.content);
      this.builtWidth = vpW;
    }
    if (this.content) this.content.x = 0;
    this.contentH = this.content?.height ?? 0;
    this.clampScroll();
  }

  private fallback(width: number): Container {
    const c = new Container();
    const t = new Text({ text: 'No content provided.', style: { fontFamily: this.ui.theme.type.family, fontSize: 18, fill: INK, wordWrap: true, wordWrapWidth: width } });
    c.addChild(t);
    return c;
  }

  private readonly onDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.lastY = e.global.y;
  };
  private readonly onMove = (e: FederatedPointerEvent): void => {
    if (!this.dragging) return;
    this.scrollY += e.global.y - this.lastY;
    this.lastY = e.global.y;
    this.clampScroll();
  };
  private readonly onUp = (): void => {
    this.dragging = false;
  };

  private clampScroll(): void {
    const min = Math.min(0, this.viewportH - this.contentH);
    this.scrollY = Math.max(min, Math.min(0, this.scrollY));
    if (this.content) this.content.y = this.scrollY;
  }

  private applyOpen(open: boolean): void {
    this.visible = open;
    this.eventMode = open ? 'static' : 'none';
    this.alpha = open ? 1 : 0;
    if (open) {
      this.scrollY = 0;
      this.clampScroll();
      if (!this.wheelHandler) {
        this.wheelHandler = (e: WheelEvent) => {
          this.scrollY -= e.deltaY;
          this.clampScroll();
        };
        window.addEventListener('wheel', this.wheelHandler, { passive: true });
      }
    } else if (this.wheelHandler) {
      window.removeEventListener('wheel', this.wheelHandler);
      this.wheelHandler = undefined;
    }
  }

  override dispose(): void {
    if (this.wheelHandler) window.removeEventListener('wheel', this.wheelHandler);
    this.close.dispose();
    super.dispose();
  }
}
