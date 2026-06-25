import { Container, Graphics, Text, Rectangle, type Ticker } from 'pixi.js';
import { type AutoplayControl, type OpenUI, type ScreenState } from '@open-ui/core';

interface Chip {
  node: Container;
  bg: Graphics;
  label: Text;
  value: number;
}

/**
 * Autoplay count picker as a BOTTOM DRAWER. When the autoplay control enters its
 * `'picking'` state (an options-mode tap), this slides up from below the screen,
 * dims the HUD, and offers the count choices + a Start button. Pick a count, press
 * Start → `autoplay.pick(count)`; tap the backdrop → `cancelPicker()`.
 *
 * It owns a full-screen overlay (not a single-control layout), so it is managed by
 * OpenUIPixi's overlay list rather than the per-control view list — and it never
 * touches the autoplay button's introspection bounds.
 */
export class AutoplayDrawerView extends Container {
  private readonly backdrop = new Graphics();
  private readonly sheet = new Container();
  private readonly sheetBg = new Graphics();
  private readonly handle = new Graphics();
  private readonly title: Text;
  private readonly startBtn = new Container();
  private readonly startBg = new Graphics();
  private readonly startLabel: Text;
  private readonly chips: Chip[] = [];

  private screen: ScreenState | undefined;
  private selected: number;
  private prog = 0; // 0 hidden → 1 fully shown
  private running = false;
  private readonly disposers: Array<() => void> = [];
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly auto: AutoplayControl, private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.zIndex = 200;
    this.visible = false;
    this.eventMode = 'none';

    const th = ui.theme;
    this.backdrop.eventMode = 'static';
    this.backdrop.cursor = 'pointer';
    this.backdrop.on('pointertap', () => this.auto.cancelPicker());

    this.title = new Text({ text: ui.t('Autoplay'), style: { fontFamily: th.type.family, fontSize: 30, fill: th.color.text, fontWeight: '800', letterSpacing: 1 } });
    this.title.anchor.set(0.5, 0);

    this.startLabel = new Text({ text: ui.t('Start'), style: { fontFamily: th.type.family, fontSize: 26, fill: th.color.accentText, fontWeight: '800', letterSpacing: 1 } });
    this.startLabel.anchor.set(0.5);
    this.startBtn.eventMode = 'static';
    this.startBtn.cursor = 'pointer';
    this.startBtn.on('pointertap', () => this.auto.pick(this.auto.options[this.selected] ?? this.auto.options[0]!));
    this.startBtn.addChild(this.startBg, this.startLabel);

    // Background + handle first so they sit BEHIND the chips/title/start.
    this.sheet.addChild(this.sheetBg, this.handle);

    // Chips: one per configured count (Infinity → ∞). Built once, placed on layout.
    this.auto.options.forEach((value, i) => {
      const node = new Container();
      const bg = new Graphics();
      const label = new Text({ text: value === Infinity ? '∞' : String(value), style: { fontFamily: th.type.family, fontSize: 28, fill: th.color.text, fontWeight: '800' } });
      label.anchor.set(0.5);
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => this.select(i));
      node.addChild(bg, label);
      this.sheet.addChild(node);
      this.chips.push({ node, bg, label, value });
    });

    this.sheet.addChild(this.title, this.startBtn);
    this.addChild(this.backdrop, this.sheet);
    this.selected = Math.max(0, this.auto.options.findIndex((o) => o !== Infinity)); // first finite, else 0

    this.tick = (t) => this.update(t.deltaMS);
    this.disposers.push(this.auto.state.subscribe(() => this.onState()));
    // Re-translate the drawer's text when the locale changes (the count chips are
    // numbers, so only the title + Start button need it).
    this.disposers.push(
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        this.title.text = this.ui.t('Autoplay');
        this.startLabel.text = this.ui.t('Start');
      }),
    );
  }

  /** Reposition + size against the current screen (called by OpenUIPixi on resize). */
  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.position.set(0, 0);
    this.scale.set(1);
    this.relayout();
  }

  private get k(): number {
    const s = this.screen;
    if (!s) return 1;
    return Math.max(0.78, Math.min(1.3, Math.min(s.width, s.height) / 1000));
  }

  private get sheetHeight(): number {
    const s = this.screen;
    const base = 300 * this.k;
    return s ? Math.min(base, s.height * 0.7) : base;
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    const W = s.width;
    const H = s.height;
    const k = this.k;
    const SH = this.sheetHeight;
    const th = this.ui.theme;

    // backdrop covers everything; hitArea set so taps register even where transparent
    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 1 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    // sheet background (rounded top), full width
    this.sheetBg.clear().roundRect(0, 0, W, SH + 40, 28 * k).fill({ color: th.color.surface }).stroke({ width: 2, color: th.color.surfaceAlt });
    this.handle.clear().roundRect(W / 2 - 32 * k, 12 * k, 64 * k, 6 * k, 3 * k).fill({ color: th.color.textDim });

    this.title.style.fontSize = 30 * k;
    this.title.position.set(W / 2, 26 * k);

    // chips: centered row(s), wrapping if they don't fit
    const cw = 92 * k;
    const ch = 70 * k;
    const gap = 16 * k;
    const maxRowW = W - 48 * k;
    const perRow = Math.max(1, Math.min(this.chips.length, Math.floor((maxRowW + gap) / (cw + gap))));
    const rows = Math.ceil(this.chips.length / perRow);
    const chipsTop = 74 * k;
    this.chips.forEach((chip, i) => {
      const row = Math.floor(i / perRow);
      const inRow = i % perRow;
      const countThisRow = Math.min(perRow, this.chips.length - row * perRow);
      const rowW = countThisRow * cw + (countThisRow - 1) * gap;
      const x = (W - rowW) / 2 + inRow * (cw + gap) + cw / 2;
      const y = chipsTop + row * (ch + gap) + ch / 2;
      chip.node.position.set(x, y);
      chip.label.style.fontSize = 28 * k;
      this.drawChip(chip, i === this.selected);
      chip.node.hitArea = new Rectangle(-cw / 2, -ch / 2, cw, ch);
    });

    // start button under the chips
    const startW = Math.min(W - 48 * k, 320 * k);
    const startH = 60 * k;
    const startY = chipsTop + rows * (ch + gap) + 6 * k + startH / 2;
    this.startBg.clear().roundRect(-startW / 2, -startH / 2, startW, startH, startH / 2).fill({ color: th.color.accent });
    this.startLabel.style.fontSize = 24 * k;
    this.startBtn.position.set(W / 2, startY);
    this.startBtn.hitArea = new Rectangle(-startW / 2, -startH / 2, startW, startH);

    this.render2();
  }

  private drawChip(chip: Chip, on: boolean): void {
    const th = this.ui.theme;
    const cw = 92 * this.k;
    const ch = 70 * this.k;
    chip.bg.clear()
      .roundRect(-cw / 2, -ch / 2, cw, ch, 14 * this.k)
      .fill({ color: on ? th.color.accent : th.color.surfaceAlt })
      .stroke({ width: 2, color: on ? th.color.accent : th.color.textDim });
    chip.label.style.fill = on ? th.color.accentText : th.color.text;
  }

  private select(i: number): void {
    this.selected = i;
    this.chips.forEach((chip, idx) => this.drawChip(chip, idx === this.selected));
  }

  private onState(): void {
    if (this.auto.current === 'picking') this.visible = true;
    if (!this.running) {
      this.running = true;
      this.ticker.add(this.tick);
    }
  }

  private update(dt: number): void {
    const target = this.auto.current === 'picking' ? 1 : 0;
    this.prog += (target - this.prog) * Math.min(1, dt / 140);
    if (Math.abs(this.prog - target) < 0.004) {
      this.prog = target;
      this.running = false;
      this.ticker.remove(this.tick);
    }
    this.render2();
  }

  /** Place the sheet by progress; drive backdrop alpha + interactivity. */
  private render2(): void {
    const s = this.screen;
    if (!s) return;
    const SH = this.sheetHeight + 40;
    this.sheet.position.set(0, s.height - SH * this.prog);
    this.backdrop.alpha = 0.62 * this.prog;
    const shown = this.prog > 0.01;
    this.visible = shown;
    this.eventMode = shown ? 'auto' : 'none';
    this.backdrop.eventMode = shown ? 'static' : 'none';
  }

  dispose(): void {
    if (this.running) {
      this.ticker.remove(this.tick);
      this.running = false;
    }
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
