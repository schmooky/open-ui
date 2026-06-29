import { Container, Graphics, Text, Rectangle, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { type PanelControl, type Control, type BlockSpec, type OpenUI, type ScreenState } from '@open-slot-ui/core';
import { ControlView } from './ControlView';
import { buildBlockColumn, type ControlViewFactory } from './blockColumn';

export interface MenuViewOptions {
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /** Header title (localizable). Default 'Menu'. */
  title?: string;
  /** Max card width in px. Default 560. */
  maxWidth?: number;
}

const MARGIN = 16;
const HEADER_H = 60;
const INSET = 22;

/** The menu ships in ONE look — the light/default card — independent of the game
 *  theme, so it can never be switched to a dark variant (matches the notice modal). */
const LIGHT = {
  surface: '#ffffff',
  surfaceAlt: '#eef1f6',
  text: '#181b20',
  textDim: '#5b6472',
  border: '#000000',
  accent: '#d99000',
} as const;

/**
 * The unified MENU: one full-screen, scrollable sheet (Settings → Paytable →
 * Rules) opened by the ☰ button. It renders the composed `BlockSpec[]` through the
 * shared {@link buildBlockColumn} renderer inside a masked, drag/wheel-scrollable
 * viewport — and, crucially, the scroll catcher sits BEHIND the content, so the
 * interactive settings (volume sliders, language select) stay usable while empty
 * space scrolls. Rebuilds on `ui.locale` change so a language switch re-renders it.
 */
export class MenuView extends ControlView {
  private readonly backdrop = new Graphics();
  private readonly card = new Graphics();
  private readonly headerBar = new Graphics();
  private readonly title: Text;
  private readonly closeBtn = new Container();
  private readonly viewport = new Container();
  private readonly maskG = new Graphics();
  private readonly catcher = new Graphics();
  private readonly content = new Container();
  /** Unclipped layer above the scroll mask for open select dropdowns. */
  private readonly dropdownLayer = new Container();
  private childViews: ControlView[] = [];

  private readonly titleKey: string;
  private readonly maxWidth: number;
  /** `ui` proxy with a light theme — feeds the shared block renderer dark-on-white. */
  private readonly lightUi: OpenUI;
  private vpW = 0;
  private vpH = 0;
  private scrollY = 0;
  private contentH = 0;
  private dragging = false;
  private lastY = 0;
  private wheelHandler: ((e: WheelEvent) => void) | undefined;

  constructor(
    private readonly panel: PanelControl,
    private readonly controls: Control[],
    private readonly blocks: BlockSpec[],
    ui: OpenUI,
    private readonly ticker: Ticker,
    private readonly opts: MenuViewOptions = {},
  ) {
    super(panel, ui);
    this.zIndex = 120;
    this.titleKey = opts.title ?? 'Menu';
    this.maxWidth = opts.maxWidth ?? 1600;

    // A light-themed view of `ui` (only `theme.color` swapped) so the shared block
    // renderer always paints the menu dark-on-white — the theme can't darken it.
    const lightTheme = { ...ui.theme, color: { ...ui.theme.color, surface: LIGHT.surface, surfaceAlt: LIGHT.surfaceAlt, text: LIGHT.text, textDim: LIGHT.textDim, accent: LIGHT.accent } };
    this.lightUi = new Proxy(ui, { get: (t, p) => (p === 'theme' ? lightTheme : Reflect.get(t, p)) }) as OpenUI;

    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.panel.closePanel());

    this.title = new Text({ text: ui.t(this.titleKey), style: { fontFamily: ui.theme.type.family, fontSize: 24, fill: LIGHT.text, fontWeight: '800', letterSpacing: 1 } });
    this.title.anchor.set(0, 0.5);

    this.buildClose();

    // Scroll catcher sits FIRST (behind the content) so interactive rows win the
    // pointer and only empty space starts a drag-scroll.
    this.viewport.addChild(this.catcher, this.content);
    this.viewport.mask = this.maskG;
    this.catcher.eventMode = 'static';
    this.catcher.on('pointerdown', this.onDown);
    this.catcher.on('globalpointermove', this.onMove);
    this.catcher.on('pointerup', this.onUp);
    this.catcher.on('pointerupoutside', this.onUp);

    this.addChild(this.backdrop, this.card, this.viewport, this.maskG, this.headerBar, this.title, this.closeBtn, this.dropdownLayer);

    this.rebuildContent();
    this.applyOpen(this.panel.isOpen);
    this.disposers.push(
      this.panel.state.subscribe(() => this.applyOpen(this.panel.isOpen)),
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        this.title.text = this.ui.t(this.titleKey);
        this.rebuildContent();
      }),
    );
  }

  private buildClose(): void {
    const r = 22;
    // Solid black circle with a white ✕ (matches the notice modal).
    const bg = new Graphics().circle(0, 0, r).fill({ color: LIGHT.border });
    const x = new Graphics()
      .moveTo(-7, -7).lineTo(7, 7).moveTo(7, -7).lineTo(-7, 7)
      .stroke({ width: 3, color: '#ffffff', cap: 'round' });
    this.closeBtn.addChild(bg, x);
    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.hitArea = new Rectangle(-r, -r, r * 2, r * 2);
    this.closeBtn.on('pointertap', () => this.panel.closePanel());
  }

  private rebuildContent(): void {
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    for (const child of this.content.removeChildren()) child.destroy();

    const bodyW = this.vpW > 0 ? this.vpW : Math.min(this.maxWidth - INSET * 2, 520);
    const col = buildBlockColumn(this.blocks, this.controls, this.lightUi, this.ticker, bodyW, { controlSkins: this.opts.controlSkins, dropdownLayer: this.dropdownLayer });
    this.childViews = col.views;
    this.content.addChild(...col.content.removeChildren());
    this.content.x = bodyW / 2; // column rows are centered at x=0
    this.contentH = col.height;
    this.clampScroll();
  }

  override applyLayout(screen: ScreenState): void {
    const W = screen.width;
    const H = screen.height;
    this.position.set(0, 0);
    this.scale.set(1);

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.5 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    // The card takes ~90% of the width (like the reference), capped on huge screens.
    const marginX = Math.max(MARGIN, Math.round(W * 0.05));
    const cardW = Math.min(W - marginX * 2, this.maxWidth);
    const cardH = H - MARGIN * 2;
    const cx = (W - cardW) / 2;
    const cy = MARGIN;
    // Always the light card with a black border (never themed dark).
    this.card.clear().roundRect(cx, cy, cardW, cardH, 14).fill({ color: LIGHT.surface }).stroke({ width: 2.5, color: LIGHT.border });

    this.headerBar.clear()
      .roundRect(cx, cy, cardW, HEADER_H, 14)
      .fill({ color: LIGHT.surfaceAlt })
      .moveTo(cx + INSET, cy + HEADER_H).lineTo(cx + cardW - INSET, cy + HEADER_H).stroke({ width: 1, color: LIGHT.textDim, alpha: 0.4 });
    this.title.position.set(cx + INSET, cy + HEADER_H / 2);
    this.closeBtn.position.set(cx + cardW - INSET - 8, cy + HEADER_H / 2);

    const vpX = cx + INSET;
    const vpY = cy + HEADER_H + INSET;
    const newVpW = cardW - INSET * 2;
    this.vpW = newVpW;
    this.vpH = cardH - HEADER_H - INSET * 2;
    this.viewport.position.set(vpX, vpY);
    this.maskG.clear().rect(vpX, vpY, this.vpW, this.vpH).fill({ color: 0xffffff });
    this.catcher.clear().rect(0, 0, this.vpW, this.vpH).fill({ color: 0xffffff, alpha: 0.0001 });
    this.catcher.hitArea = new Rectangle(0, 0, this.vpW, this.vpH);

    // Rebuild the column to the live viewport width (so wrapping is correct).
    this.rebuildContent();
    this.clampScroll();
  }

  /** Close any open select dropdown (so scrolling/closing doesn't strand it). */
  private closeSelects(): void {
    for (const c of this.controls) {
      const sc = c as { isOpen?: boolean; closeList?: () => void };
      if (sc.isOpen && typeof sc.closeList === 'function') sc.closeList();
    }
  }

  private readonly onDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.lastY = e.global.y;
    this.closeSelects();
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
    const min = Math.min(0, this.vpH - this.contentH);
    this.scrollY = Math.max(min, Math.min(0, this.scrollY));
    this.content.y = this.scrollY;
  }

  private applyOpen(open: boolean): void {
    this.visible = open;
    this.eventMode = open ? 'static' : 'none';
    if (open) {
      this.scrollY = 0;
      this.clampScroll();
      if (!this.wheelHandler && typeof window !== 'undefined') {
        this.wheelHandler = (e: WheelEvent) => {
          this.closeSelects();
          this.scrollY -= e.deltaY;
          this.clampScroll();
        };
        window.addEventListener('wheel', this.wheelHandler, { passive: true });
      }
    } else {
      this.closeSelects();
      if (this.wheelHandler && typeof window !== 'undefined') {
        window.removeEventListener('wheel', this.wheelHandler);
        this.wheelHandler = undefined;
      }
    }
  }

  override dispose(): void {
    if (this.wheelHandler && typeof window !== 'undefined') window.removeEventListener('wheel', this.wheelHandler);
    for (const v of this.childViews) v.dispose();
    this.childViews.length = 0;
    super.dispose();
  }
}
