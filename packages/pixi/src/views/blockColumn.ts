import { Container, Graphics, Text, Sprite, Texture, type TextStyleOptions, type Ticker } from 'pixi.js';
import {
  type OpenUI,
  type Control,
  type BlockSpec,
  type SliderControl,
  type ToggleControl,
  type ButtonControl,
  type SelectControl,
  type StepperControl,
  type ValueDisplay,
} from '@open-ui/core';
import { ControlView } from './ControlView';
import { SliderView } from './SliderView';
import { ToggleView } from './ToggleView';
import { ButtonView } from './ButtonView';
import { SelectView } from './SelectView';
import { StepperView } from './StepperView';
import { ValueDisplayView } from './ValueDisplayView';

/** Per-id view override — swap a control's renderer without forking (Charter P7). */
export type ControlViewFactory = (control: Control, ui: OpenUI, ticker: Ticker) => ControlView;

export interface BlockColumnOptions {
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /** Unclipped layer for select dropdowns (so a scroll mask doesn't clip them). */
  dropdownLayer?: Container;
}

export interface BlockColumn {
  /** Rows laid top→down (first row near y=0); the caller positions/scrolls it. */
  content: Container;
  /** Interactive child views, for disposal. */
  views: ControlView[];
  /** Total column height. */
  height: number;
  /** Inner content width (body width minus padding). */
  innerW: number;
}

const ROW_H = 72;
const PAD = 28;
const GAP = 16;

/**
 * Render a declarative `BlockSpec[]` into a column of rows — interactive controls
 * (slider/toggle/button/select/value/stepper) and static content (heading/text/
 * callout/stat-grid/steps/paytable/image). All text flows through `ui.t`. This is
 * the single renderer shared by the small panel body AND the scrollable menu, so
 * blocks look identical wherever they appear (Charter B3/B9).
 */
export function buildBlockColumn(
  blocks: BlockSpec[],
  controls: Control[],
  ui: OpenUI,
  ticker: Ticker,
  bodyW: number,
  opts: BlockColumnOptions = {},
): BlockColumn {
  const t = ui.theme;
  const tr = (s: string): string => ui.t(s);
  const innerW = bodyW - PAD * 2;
  const byId = new Map(controls.map((c) => [c.id, c] as const));
  const content = new Container();
  const views: ControlView[] = [];
  let y = PAD;

  const placeFixed = (node: Container, h: number): void => {
    node.position.set(0, y + h / 2);
    content.addChild(node);
    y += h;
  };
  const placeAuto = (node: Container, gap = GAP): void => {
    const h = node.height || 1;
    node.position.set(0, y + h / 2);
    content.addChild(node);
    y += h + gap;
  };
  const leftText = (s: string, style: TextStyleOptions): Container => {
    const wrap = new Container();
    const txt = new Text({ text: s, style });
    txt.anchor.set(0, 0.5);
    txt.position.set(-innerW / 2, 0);
    wrap.addChild(txt);
    return wrap;
  };
  // Section header: a CENTERED uppercase-ish title with a divider line on each
  // side (── TITLE ──), matching the reference design. Theme-colored, so it reads
  // on any surface (light lines on a dark theme, dark lines on a light one).
  const heading = (s: string, size = 18): Container => {
    const wrap = new Container();
    const txt = new Text({
      text: tr(s),
      style: { fontFamily: t.type.family, fontSize: size, fill: t.color.text, fontWeight: '800', letterSpacing: 1 },
    });
    txt.anchor.set(0.5);
    txt.position.set(0, 0);
    const half = Math.min(txt.width / 2, innerW / 2 - 24);
    const gap = 16;
    wrap.addChild(
      new Graphics().moveTo(-innerW / 2, 0).lineTo(-half - gap, 0).stroke({ width: 2, color: t.color.text, alpha: 0.85 }),
      new Graphics().moveTo(half + gap, 0).lineTo(innerW / 2, 0).stroke({ width: 2, color: t.color.text, alpha: 0.85 }),
      txt,
    );
    return wrap;
  };
  const body = (s: string): Container =>
    richParagraphNode(s, ui, innerW, { fontFamily: t.type.family, fontSize: 15, fill: t.color.textDim, lineHeight: 22 });
  // A left-aligned sub-section title (no divider lines — lighter than `heading`).
  const subheading = (s: string): Container => {
    const wrap = new Container();
    const txt = new Text({ text: tr(s), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '800', letterSpacing: 0.5 } });
    txt.anchor.set(0, 0.5);
    txt.position.set(-innerW / 2, 0);
    wrap.addChild(txt);
    return wrap;
  };
  // Fine-print / legal copy: small and dim.
  const legal = (s: string): Container =>
    richParagraphNode(s, ui, innerW, { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, lineHeight: 17 });
  // Centered caption above an interactive control (slider/toggle) — reads cleanly
  // above the centered control even on a wide card.
  const caption = (s: string): Container => {
    const wrap = new Container();
    const txt = new Text({ text: s, style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '700' } });
    txt.anchor.set(0.5);
    wrap.addChild(txt);
    return wrap;
  };

  const makeView = (b: BlockSpec, control: Control): ControlView | null => {
    const skin = opts.controlSkins?.[b.id];
    if (skin) return skin(control, ui, ticker);
    switch (b.kind) {
      case 'slider':
        return new SliderView(control as SliderControl, ui);
      case 'toggle':
        return new ToggleView(control as ToggleControl, ui, ticker, { radius: 22 });
      case 'button':
        return new ButtonView(control as ButtonControl, ui, ticker, { shape: 'pill', height: 48 });
      case 'select':
        return new SelectView(control as SelectControl, ui, ticker, { width: 320, dropdownLayer: opts.dropdownLayer });
      case 'stepper':
        return new StepperView(control as StepperControl, ui, ticker);
      case 'value':
        return new ValueDisplayView(control as ValueDisplay, ui, ticker);
      default:
        console.warn(`[open-ui] block column: no view for kind "${b.kind}" (id="${b.id}") — skipped`);
        return null;
    }
  };

  const walk = (bs: BlockSpec[]): void => {
    for (const b of bs) {
      switch (b.kind) {
        case 'group':
          if (b.title) placeAuto(heading(b.title, 14), 10);
          walk(b.children);
          break;
        case 'heading':
          placeAuto(heading(b.text), 12);
          break;
        case 'subheading':
          placeAuto(subheading(b.text), 8);
          break;
        case 'text':
          placeAuto(body(tr(b.text)));
          break;
        case 'legal':
          placeAuto(legal(tr(b.text)));
          break;
        case 'divider':
          placeAuto(dividerNode(innerW, ui), 10);
          break;
        case 'callout':
          placeAuto(calloutNode(b, ui, innerW));
          break;
        case 'stat-grid':
          placeAuto(statGridNode(b, ui, innerW));
          break;
        case 'steps':
          placeAuto(body(b.items.map((s, i) => `${b.ordered ? `${i + 1}.` : '•'}  ${tr(s)}`).join('\n')));
          break;
        case 'table':
          placeAuto(tableNode(b, ui, innerW));
          break;
        case 'cards':
          placeAuto(cardsNode(b, ui, innerW));
          break;
        case 'paytable':
          placeAuto(paytableNode(b, ui, innerW));
          break;
        case 'media':
          placeAuto(mediaNode(b, ui, innerW));
          break;
        case 'image': {
          let iw = b.width || 64;
          let ih = b.height || 64;
          if (iw > innerW) { ih = Math.round((ih * innerW) / iw); iw = innerW; } // fit the menu width
          placeAuto(imageBoxNode(b.src, iw, ih, ui));
          break;
        }
        default: {
          const control = byId.get(b.id);
          if (!control) break;
          // Slider/Toggle don't draw their own label — add a caption row above them.
          // (Select/Stepper/Value/Button render their own label, so skip those.)
          if ((b.kind === 'slider' || b.kind === 'toggle') && b.label) placeAuto(caption(tr(b.label)), 6);
          const view = makeView(b, control);
          if (!view) break;
          views.push(view);
          const wrap = new Container();
          if (b.kind === 'slider') view.position.set(-130, -27); // SliderView is left-origin
          wrap.addChild(view);
          placeFixed(wrap, ROW_H);
        }
      }
    }
  };
  walk(blocks);

  return { content, views, height: y + PAD, innerW };
}

/**
 * A left-aligned paragraph supporting **bold** inline runs (and `\n` breaks),
 * word-wrapped to `width`, centred vertically around local 0. Pure Pixi Text, so
 * it's deterministic (no HTMLText). Bold runs use the strong text colour.
 */
function richParagraphNode(s: string, ui: OpenUI, width: number, style: TextStyleOptions): Container {
  const t = ui.theme;
  const c = new Container();
  const lineH = typeof style.lineHeight === 'number' ? style.lineHeight : 22;
  const dim = style.fill;
  const runs: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    runs.push({ text: m[1]!, bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });

  let x = 0;
  let line = 0;
  const x0 = -width / 2;
  for (const run of runs) {
    for (const w of run.text.split(/(\n|\s+)/).filter((p) => p.length)) {
      if (w === '\n') { x = 0; line += 1; continue; }
      const isSpace = /^\s+$/.test(w);
      if (isSpace && x === 0) continue;
      const txt = new Text({ text: w, style: { ...style, fontWeight: run.bold ? '800' : style.fontWeight ?? '400', fill: run.bold ? t.color.text : dim } });
      txt.anchor.set(0, 0);
      if (!isSpace && x > 0 && x + txt.width > width) { x = 0; line += 1; }
      txt.position.set(x0 + x, line * lineH);
      c.addChild(txt);
      x += txt.width;
    }
  }
  const totalH = (line + 1) * lineH;
  for (const ch of c.children) ch.y -= totalH / 2;
  return c;
}

function calloutNode(b: Extract<BlockSpec, { kind: 'callout' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const tone = b.tone === 'warning' ? '#ffb020' : t.color.accent;
  const c = new Container();
  const padX = 16;
  const padY = 12;
  const textW = innerW - padX * 2 - 4;
  const title = b.title
    ? new Text({ text: ui.t(b.title), style: { fontFamily: t.type.family, fontSize: 14, fill: tone, fontWeight: '800', letterSpacing: 0.3 } })
    : null;
  title?.anchor.set(0, 0);
  const bodyNode = richParagraphNode(ui.t(b.text), ui, textW, { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, lineHeight: 20 });
  const bodyH = bodyNode.height;
  const titleH = title ? title.height + 6 : 0;
  const h = padY * 2 + titleH + bodyH;
  const x = -innerW / 2;
  const bg = new Graphics()
    .roundRect(x, -h / 2, innerW, h, 10)
    .fill({ color: tone, alpha: 0.08 })
    .roundRect(x, -h / 2, innerW, h, 10)
    .stroke({ width: 1.5, color: tone, alpha: 0.5 })
    .roundRect(x, -h / 2, 4, h, 2)
    .fill({ color: tone });
  c.addChild(bg);
  if (title) {
    title.position.set(x + padX, -h / 2 + padY);
    c.addChild(title);
  }
  bodyNode.position.set(x + padX + textW / 2, -h / 2 + padY + titleH + bodyH / 2);
  c.addChild(bodyNode);
  return c;
}

function statGridNode(b: Extract<BlockSpec, { kind: 'stat-grid' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const rowH = 30;
  const totalH = Math.max(b.items.length * rowH, rowH);
  b.items.forEach((it, i) => {
    const cy = -totalH / 2 + rowH / 2 + i * rowH;
    if (i > 0) {
      c.addChild(new Graphics().moveTo(-innerW / 2, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    }
    const label = new Text({ text: ui.t(it.label), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.textDim } });
    label.anchor.set(0, 0.5);
    label.position.set(-innerW / 2, cy);
    const value = new Text({ text: ui.t(it.value), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, fontWeight: '700' } });
    value.anchor.set(1, 0.5);
    value.position.set(innerW / 2, cy);
    c.addChild(label, value);
  });
  return c;
}

/** A thin full-width rule used to separate sections (e.g. before legal copy). */
function dividerNode(innerW: number, ui: OpenUI): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(-innerW / 2, -0.5, innerW, 1).fill({ color: ui.theme.color.textDim, alpha: 0.3 }));
  return c;
}

/** A generic table: an optional bold header row + body rows of cells. First column
 *  left-aligned (labels); every cell flows through `ui.t`. */
function tableNode(b: Extract<BlockSpec, { kind: 'table' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const head = b.columns && b.columns.length ? [b.columns] : [];
  const allRows = [...head, ...b.rows];
  const cols = Math.max(1, b.columns?.length ?? b.rows[0]?.length ?? 1);
  const colW = innerW / cols;
  const rowH = 30;
  const totalH = Math.max(allRows.length * rowH, rowH);
  const left = -innerW / 2;
  allRows.forEach((row, ri) => {
    const cy = -totalH / 2 + rowH / 2 + ri * rowH;
    const isHeader = head.length > 0 && ri === 0;
    if (ri > 0) {
      c.addChild(new Graphics().moveTo(left, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.18 }));
    }
    for (let ci = 0; ci < cols; ci++) {
      const raw = row[ci] ?? '';
      const cx = left + ci * colW + 8;
      const fill = isHeader ? t.color.text : ci === 0 ? t.color.text : t.color.accent;
      const weight = isHeader ? '800' : ci === 0 ? '700' : '700';
      const txt = new Text({ text: ui.t(raw), style: { fontFamily: t.type.family, fontSize: 13, fill, fontWeight: weight } });
      txt.anchor.set(0, 0.5);
      txt.position.set(cx, cy);
      c.addChild(txt);
    }
  });
  return c;
}

/** A row of feature cards (icon on top + bold title + dim text), wrapping to fit. */
function cardsNode(b: Extract<BlockSpec, { kind: 'cards' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const n = b.items.length || 1;
  const gap = 12;
  const cols = Math.max(1, Math.min(n, Math.floor((innerW + gap) / (150 + gap))));
  const cardW = (innerW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(n / cols);
  const cardH = 132;
  const totalH = rows * cardH + (rows - 1) * gap;
  b.items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardX = -innerW / 2 + col * (cardW + gap);
    const cardY = -totalH / 2 + row * (cardH + gap);
    const card = new Container();
    card.addChild(
      new Graphics()
        .roundRect(0, 0, cardW, cardH, 12)
        .fill({ color: t.color.surfaceAlt, alpha: 0.6 })
        .roundRect(0, 0, cardW, cardH, 12)
        .stroke({ width: 1, color: t.color.textDim, alpha: 0.15 }),
    );
    if (it.icon) {
      const icon = imageBoxNode(it.icon, 44, 44, ui);
      icon.position.set(cardW / 2, 34);
      card.addChild(icon);
    }
    const title = new Text({ text: ui.t(it.title), style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.text, fontWeight: '800' } });
    title.anchor.set(0.5, 0);
    title.position.set(cardW / 2, it.icon ? 64 : 14);
    card.addChild(title);
    if (it.text) {
      const para = richParagraphNode(ui.t(it.text), ui, cardW - 20, { fontFamily: t.type.family, fontSize: 12, fill: t.color.textDim, lineHeight: 16 });
      para.position.set(cardW / 2, (it.icon ? 96 : 46) + para.height / 2);
      card.addChild(para);
    }
    card.position.set(cardX, cardY);
    c.addChild(card);
  });
  return c;
}

/** Image + text side-by-side (image left or right), vertically centered. */
function mediaNode(b: Extract<BlockSpec, { kind: 'media' }>, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const imgW = Math.min(b.width ?? 200, Math.round(innerW * 0.4));
  const imgH = b.width && b.height ? Math.round((imgW * b.height) / b.width) : Math.round(imgW * 0.62);
  const gap = 18;
  const textW = innerW - imgW - gap;
  const side = b.side ?? 'left';
  const imgX = side === 'left' ? -innerW / 2 + imgW / 2 : innerW / 2 - imgW / 2;
  const textCx = side === 'left' ? -innerW / 2 + imgW + gap + textW / 2 : -innerW / 2 + textW / 2;

  const title = b.title
    ? new Text({ text: ui.t(b.title), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '800' } })
    : null;
  title?.anchor.set(0, 0);
  const para = richParagraphNode(ui.t(b.text), ui, textW, { fontFamily: t.type.family, fontSize: 14, fill: t.color.textDim, lineHeight: 19 });
  const titleH = title ? title.height + 8 : 0;
  const textH = titleH + para.height;
  const h = Math.max(imgH, textH);

  const img = imageBoxNode(b.src, imgW, imgH, ui);
  img.position.set(imgX, 0);
  c.addChild(img);
  if (title) {
    title.position.set(textCx - textW / 2, -textH / 2);
    c.addChild(title);
  }
  para.position.set(textCx, -textH / 2 + titleH + para.height / 2);
  c.addChild(para);
  // reserve the full height so placeAuto spaces the next block correctly
  c.addChild(new Graphics().rect(-innerW / 2, -h / 2, 1, h).fill({ color: 0xffffff, alpha: 0 }));
  return c;
}

/** A sized box that holds the image's intended footprint while it loads, then
 *  renders the image RAW (no imposed border/rounding — designers style their own
 *  art). Loads via an `Image` element + `Texture.from` so ANY URL/format works
 *  (incl. extensionless/SVG hosts like placehold.co) with CORS. */
function imageBoxNode(src: string, w: number, h: number, ui: OpenUI): Container {
  const t = ui.theme;
  const box = new Container();
  // a faint, un-framed loading placeholder (removed once the image paints)
  const placeholder = new Graphics().rect(-w / 2, -h / 2, w, h).fill({ color: t.color.surfaceAlt, alpha: 0.5 });
  box.addChild(placeholder);
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (box.destroyed) return;
      try {
        const sp = new Sprite(Texture.from(img));
        sp.anchor.set(0.5);
        sp.width = w;
        sp.height = h;
        box.addChild(sp);
        placeholder.visible = false; // show the raw image, not over a placeholder box
      } catch {
        /* keep the placeholder if the texture can't be created */
      }
    };
    img.onerror = () => {
      /* keep the placeholder box (it shows the intended size) */
    };
    img.src = src;
  }
  return box;
}

type PaytableBlock = Extract<BlockSpec, { kind: 'paytable' }>;

/** Paytable: a multi-column symbol grid (icon/name + tiered payouts) when
 *  `columns > 1` (the reference design), else a single-column list. */
function paytableNode(b: PaytableBlock, ui: OpenUI, innerW: number): Container {
  const want = Math.max(1, b.columns ?? 1);
  const fit = Math.max(1, Math.floor(innerW / 170)); // auto-reduce to fit narrow menus
  const cols = Math.max(1, Math.min(want, fit, b.rows.length || 1));
  return cols <= 1 ? paytableList(b, ui, innerW) : paytableGrid(b, ui, innerW, cols);
}

function paytableList(b: PaytableBlock, ui: OpenUI, innerW: number): Container {
  const t = ui.theme;
  const c = new Container();
  const rowH = 44;
  const totalH = Math.max(b.rows.length * rowH, rowH);
  const hasIcons = b.rows.some((r) => r.icon);
  const left = -innerW / 2;
  const symbolX = left + (hasIcons ? 48 : 4);
  b.rows.forEach((r, i) => {
    const cy = -totalH / 2 + rowH / 2 + i * rowH;
    if (i > 0) {
      c.addChild(new Graphics().moveTo(left, cy - rowH / 2).lineTo(innerW / 2, cy - rowH / 2).stroke({ width: 1, color: t.color.textDim, alpha: 0.15 }));
    }
    if (r.icon) {
      const icon = imageBoxNode(r.icon, 36, 36, ui);
      icon.position.set(left + 22, cy);
      c.addChild(icon);
    }
    const sym = new Text({ text: ui.t(r.symbol ?? ''), style: { fontFamily: t.type.family, fontSize: 15, fill: t.color.text, fontWeight: '700' } });
    sym.anchor.set(0, 0.5);
    sym.position.set(symbolX, cy);
    const pay = new Text({ text: r.payouts, style: { fontFamily: t.type.family, fontSize: 14, fill: t.color.accent, fontWeight: '700' } });
    pay.anchor.set(1, 0.5);
    pay.position.set(innerW / 2, cy);
    c.addChild(sym, pay);
  });
  return c;
}

function paytableGrid(b: PaytableBlock, ui: OpenUI, innerW: number, cols: number): Container {
  const c = new Container();
  const cellW = innerW / cols;
  const gridRows = Math.ceil(b.rows.length / cols);
  const lineH = 17;
  const maxLines = b.rows.reduce((m, r) => Math.max(m, (r.payouts || '').split('\n').length), 1);
  const cellH = Math.max(48, 14 + maxLines * lineH);
  const totalH = gridRows * cellH;
  b.rows.forEach((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cell = paytableCell(r, ui, cellW, lineH);
    cell.position.set(-innerW / 2 + col * cellW + cellW / 2, -totalH / 2 + row * cellH + cellH / 2);
    c.addChild(cell);
  });
  return c;
}

/** One symbol cell: an icon (or bold name) on the left, the tiered payouts on the
 *  right — each line "label: value" with the tier label bold (matching the design). */
function paytableCell(r: PaytableBlock['rows'][number], ui: OpenUI, cellW: number, lineH: number): Container {
  const t = ui.theme;
  const cell = new Container();
  const lx = -cellW / 2 + 10;
  let leftW = 0;
  if (r.icon) {
    const icon = imageBoxNode(r.icon, 40, 40, ui);
    icon.position.set(lx + 20, 0);
    cell.addChild(icon);
    leftW = 52;
  } else if (r.symbol) {
    const sym = new Text({ text: ui.t(r.symbol), style: { fontFamily: t.type.family, fontSize: 14, fontWeight: '800', fill: t.color.text } });
    sym.anchor.set(0, 0.5);
    sym.position.set(lx, 0);
    cell.addChild(sym);
    leftW = sym.width + 14;
  }
  const lines = (r.payouts || '').split('\n');
  const blockH = lines.length * lineH;
  const px = lx + leftW;
  lines.forEach((ln, j) => {
    const ly = -blockH / 2 + lineH / 2 + j * lineH;
    const ci = ln.indexOf(':');
    if (ci >= 0) {
      const label = new Text({ text: ln.slice(0, ci + 1), style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '800', fill: t.color.text } });
      label.anchor.set(0, 0.5);
      label.position.set(px, ly);
      const val = new Text({ text: ln.slice(ci + 1), style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '700', fill: t.color.accent } });
      val.anchor.set(0, 0.5);
      val.position.set(px + label.width + 4, ly);
      cell.addChild(label, val);
    } else {
      const txt = new Text({ text: ln, style: { fontFamily: t.type.family, fontSize: 13, fontWeight: '700', fill: t.color.accent } });
      txt.anchor.set(0, 0.5);
      txt.position.set(px, ly);
      cell.addChild(txt);
    }
  });
  return cell;
}
