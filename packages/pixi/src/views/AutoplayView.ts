import { Container, Graphics, Sprite, Text, Circle, type Texture, type Ticker, type FederatedPointerEvent } from 'pixi.js';
import { type AutoplayControl, type OpenUI } from '@open-slot-ui/core';
import { ControlView } from './ControlView';

const DEG = Math.PI / 180;

export interface AutoplayViewOptions {
  idleTexture?: Texture;
  activeTexture?: Texture;
  target?: number;
  radius?: number;
  /**
   * Count-picker presentation. `'drawer'` (default) defers picking to the bottom
   * AutoplayDrawerView and keeps this button still; `'radial'` fans the count
   * chips on an arc around the spin button (the classic in-place picker).
   */
  picker?: 'drawer' | 'radial';
  /** Spin-button center in THIS view's local coords — the chips arc around it. */
  arcCenter?: { x: number; y: number };
  /** Fixed angle between chips (degrees). */
  arcStepDeg?: number;
  /** Arc radius (default = distance to arcCenter). */
  arcRadius?: number;
  /** Sweep direction along the arc (+1 over the top, -1 under). */
  arcDir?: 1 | -1;
}

interface Chip {
  node: Container;
  scale: number;
}

/**
 * Autoplay button with a RADIAL count picker.
 * - tap (idle): button rotates −60°, the count chips pop in one-by-one along an
 *   arc around the spin button (fixed angle apart);
 * - pick a chip: the fan collapses and the button becomes a STOP square + count;
 * - tap (picking): button rotates +60° back and the fan hides;
 * - tap (active): stops autoplay.
 * The host runs the loop and feeds the live count.
 */
export class AutoplayView extends ControlView {
  private readonly art = new Container(); // the rotating button
  private readonly bg = new Graphics();
  private sprite: Sprite | undefined;
  private readonly countText: Text;
  private readonly chipLayer = new Container(); // chips stay upright (don't rotate)
  private readonly chips: Chip[] = [];
  private readonly idleTex: Texture | undefined;
  private readonly activeTex: Texture | undefined;
  private readonly target: number;
  private readonly radius: number;

  private rot = 0;
  private rotTarget = 0;
  private phase = 0; // ms since last state change (drives the stagger)
  private running = false;
  private readonly useRadial: boolean;
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly auto: AutoplayControl, ui: OpenUI, private readonly ticker: Ticker, opts: AutoplayViewOptions = {}) {
    super(auto, ui);
    this.idleTex = opts.idleTexture;
    this.activeTex = opts.activeTexture;
    this.target = opts.target ?? 88;
    this.radius = opts.radius ?? 44;
    this.useRadial = opts.picker === 'radial';

    this.art.addChild(this.bg);
    if (this.idleTex || this.activeTex) {
      this.sprite = new Sprite(this.idleTex ?? this.activeTex);
      this.sprite.anchor.set(0.5);
      this.fit();
      this.art.addChild(this.sprite);
    }
    this.countText = new Text({ text: '', style: { fontFamily: ui.theme.type.family, fontSize: 26, fill: ui.theme.color.accentText, fontWeight: '800' } });
    this.countText.anchor.set(0.5);

    this.addChild(this.chipLayer, this.art, this.countText);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Circle(0, 0, (this.sprite ? this.target / 2 : this.radius) + 8);
    this.on('pointerup', () => this.auto.press());

    if (this.useRadial) this.buildChips(opts);

    this.tick = (t) => this.update(t.deltaMS);
    this.disposers.push(
      this.auto.state.subscribe(() => this.onState()),
      this.auto.count.subscribe(() => this.drawButton()),
    );
    this.drawButton();
  }

  private fit(): void {
    if (!this.sprite) return;
    this.sprite.scale.set(1);
    this.sprite.scale.set(this.target / this.sprite.height);
  }

  private fmt(n: number): string {
    return n === Infinity ? '∞' : String(n);
  }

  private buildChips(opts: AutoplayViewOptions): void {
    const cx = opts.arcCenter?.x ?? 0;
    const cy = opts.arcCenter?.y ?? 0;
    const R = opts.arcRadius ?? (Math.hypot(cx, cy) || 220);
    const start = Math.atan2(-cy, -cx); // angle from arc-center to this button
    const step = (opts.arcStepDeg ?? 24) * DEG * (opts.arcDir ?? 1);
    const th = this.ui.theme;
    const CR = 34; // white circle radius

    this.auto.options.forEach((opt, i) => {
      const ang = start + (i + 1) * step; // first chip one step past the button, fanning around spin
      const node = new Container();
      node.addChild(new Graphics().circle(0, 0, CR).fill({ color: 0xffffff }).stroke({ width: 4, color: 0x000000 }));
      const t = new Text({ text: this.fmt(opt), style: { fontFamily: th.type.family, fontSize: 25, fill: 0x15171c, fontWeight: '800' } });
      t.anchor.set(0.5);
      node.addChild(t);
      node.position.set(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
      node.scale.set(0);
      node.visible = false;
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.hitArea = new Circle(0, 0, CR + 4);
      node.on('pointerup', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.auto.pick(opt);
      });
      this.chipLayer.addChild(node);
      this.chips.push({ node, scale: 0 });
    });
  }

  private onState(): void {
    // In drawer mode the button stays put; the bottom sheet is the picker.
    this.rotTarget = this.useRadial && this.auto.current === 'picking' ? -60 * DEG : 0;
    this.phase = 0;
    this.drawButton();
    if (!this.running) {
      this.running = true;
      this.ticker.add(this.tick);
    }
  }

  private update(dt: number): void {
    this.phase += Math.min(dt, 40); // cap stalls so a stagger step is never skipped
    this.rot += (this.rotTarget - this.rot) * Math.min(1, dt / 110);
    this.art.rotation = this.rot;

    const opening = this.auto.current === 'picking';
    const n = this.chips.length;
    let settled = Math.abs(this.rot - this.rotTarget) < 0.003;
    for (let i = 0; i < n; i++) {
      const chip = this.chips[i]!;
      let target: number;
      let ease: number;
      if (opening) {
        target = this.phase > i * 70 ? 1 : 0; // fan OUT in order, gentle
        ease = Math.min(1, dt / 95);
      } else {
        target = this.phase > (n - 1 - i) * 36 ? 0 : 1; // retract LAST→first, tighter stagger
        ease = Math.min(1, dt / 42); // snappier easing on close
      }
      chip.scale += (target - chip.scale) * ease;
      chip.node.scale.set(chip.scale);
      chip.node.visible = chip.scale > 0.01;
      if (Math.abs(chip.scale - (opening ? 1 : 0)) > 0.01) settled = false;
    }
    if (settled) {
      this.running = false;
      this.ticker.remove(this.tick);
    }
  }

  private drawButton(): void {
    const st = this.auto.current;
    // The count now lives on the SPIN button (the STOP-N button). This button never
    // shows a number.
    this.countText.visible = false;
    const th = this.ui.theme;

    // While autoplay runs, this button is just a YELLOW, DISABLED indicator — the
    // spin button becomes STOP-N and is what stops autoplay. Non-interactive here.
    const active = st === 'active';
    this.eventMode = active ? 'none' : 'static';
    this.cursor = active ? 'default' : 'pointer';

    if (active) {
      this.bg.clear();
      if (this.sprite) {
        // Tint the button ART yellow (white disc → accent, dark ring/glyph stay dark)
        // so the highlight is exactly the button's size — no oversized circle behind.
        this.sprite.visible = true;
        this.sprite.tint = th.color.accent;
        this.sprite.alpha = 0.9; // slightly dimmed → reads as disabled
      } else {
        // Drawn fallback (no art): a yellow disc at the real button radius.
        this.bg.circle(0, 0, this.radius).fill({ color: th.color.accent }).stroke({ width: 4, color: th.color.accentText });
      }
      return;
    }

    if (this.sprite) {
      this.sprite.visible = true;
      this.sprite.tint = 0xffffff;
      this.bg.clear();
      const tex = this.idleTex ?? this.activeTex;
      if (tex) this.sprite.texture = tex;
      this.fit();
      this.sprite.alpha = st === 'disabled' ? 0.5 : 1;
    } else {
      this.bg.clear();
      this.bg.circle(0, 0, this.radius).fill({ color: th.color.surface }).stroke({ width: 4, color: th.color.accent });
    }
  }

  override dispose(): void {
    if (this.running) {
      this.ticker.remove(this.tick);
      this.running = false;
    }
    super.dispose();
  }
}
