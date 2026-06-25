import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface StepperOptions {
  id: string;
  layout: LayoutSpec;
  /** Ordered list of allowed values (e.g. bet levels). */
  levels: number[];
  /** Starting index into `levels`. Default 0. */
  index?: number;
  /** Optional caption (e.g. "Bet"). */
  label?: string;
}

/**
 * Steps through a host-provided ordered list of values (bet levels). `inc`/`dec`
 * move the index and clamp at the ends; `canInc`/`canDec` drive the +/- buttons'
 * enabled state. Emits `valueChanged` with the resolved value.
 */
export class StepperControl extends Control {
  readonly states: StateMap = { idle: { interactable: true } };
  readonly index: Signal<number>;
  /** Optional caption (e.g. "Bet"). */
  readonly label?: string;
  private levels: number[];

  constructor(opts: StepperOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'spinbutton', layout: opts.layout }, 'idle');
    this.levels = opts.levels.length ? opts.levels : [0];
    this.index = new Signal<number>(this.clampIndex(opts.index ?? 0));
    this.label = opts.label;
  }

  private clampIndex(i: number): number {
    return Math.max(0, Math.min(this.levels.length - 1, i));
  }

  get value(): number {
    return this.levels[this.index.get()] ?? 0;
  }
  get canInc(): boolean {
    return this.index.get() < this.levels.length - 1;
  }
  get canDec(): boolean {
    return this.index.get() > 0;
  }

  inc(): void {
    if (this.canInc) this.setIndex(this.index.get() + 1);
  }
  dec(): void {
    if (this.canDec) this.setIndex(this.index.get() - 1);
  }

  setIndex(i: number): void {
    const next = this.clampIndex(i);
    if (next === this.index.get()) return;
    this.index.set(next);
    this.bus?.emit('valueChanged', { id: this.id, value: this.value });
  }

  /** Replace the level list (e.g. when the currency/limits change). */
  setLevels(levels: number[], index = 0): void {
    const prior = this.value;
    if (levels.length) this.levels = levels;
    this.index.set(this.clampIndex(index));
    // Emit only when the resolved value actually changed (mirrors setIndex) —
    // a no-op setLevels must not fire a spurious public valueChanged / log entry.
    if (this.value !== prior) this.bus?.emit('valueChanged', { id: this.id, value: this.value });
  }
}
