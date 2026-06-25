import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { type CellRenderer } from 'pixi-text-counter';

export interface TextCellRendererOptions {
  style: TextStyleOptions;
  digitWidth: number;
  digitHeight: number;
  /** Glyph shown on intermediate (filler) frames during a roll. '' = blank. */
  fillerChar?: string;
}

/**
 * A zero-asset CellRenderer for pixi-text-counter using plain Pixi `Text`.
 * Mirrors the shipped BitmapFontCellRenderer's cell convention: each digit is
 * centered within a digitWidth x digitHeight box.
 */
export class TextCellRenderer implements CellRenderer<Container> {
  constructor(private readonly o: TextCellRendererOptions) {}

  createCell(digit: number): Container {
    const cell = new Container();
    const t = new Text({ text: String(digit), style: this.o.style });
    t.anchor.set(0.5, 0.5);
    t.x = this.o.digitWidth / 2;
    t.y = this.o.digitHeight / 2;
    cell.addChild(t);
    return cell;
  }

  setDigit(cell: Container, digit: number): void {
    const t = cell.children[0] as Text;
    const next = String(digit);
    if (t.text !== next) t.text = next;
  }

  setFiller(cell: Container, digit: number): void {
    const t = cell.children[0] as Text;
    const next = this.o.fillerChar ?? String(digit);
    if (t.text !== next) t.text = next;
  }

  createSeparator(char: string): Container {
    const cell = new Container();
    const t = new Text({ text: char, style: this.o.style });
    t.anchor.set(0.5, 0.5);
    cell.addChild(t);
    t.y = this.o.digitHeight / 2;
    t.x = t.width / 2;
    return cell;
  }

  destroyCell(cell: Container): void {
    cell.destroy({ children: true });
  }
}
