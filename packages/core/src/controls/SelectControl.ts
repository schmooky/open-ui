import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectControlOptions {
  id: string;
  layout: LayoutSpec;
  options: SelectOption[];
  index?: number;
  /** Caption shown beside the control (e.g. "Language"). */
  label?: string;
  role?: string;
}

/**
 * A single-choice select (language, quality, …). FSM peer of StepperControl:
 * `closed | open | disabled`. Tapping cycles or opens a list; all logic is
 * headless and the renderer just draws it. Emits its OWN typed `optionSelected`
 * event rather than overloading the numeric `valueChanged` (Charter B1, P5).
 */
export class SelectControl extends Control {
  readonly states: StateMap = {
    closed: { interactable: true, transition: new Squish(0.96, 100) },
    open: { interactable: true, transition: new Pulse(1.04, 140) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };
  readonly index: Signal<number>;
  /** Caption (e.g. "Language") — distinct from the selected option's label. */
  readonly caption?: string;
  private _options: SelectOption[];

  constructor(opts: SelectControlOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    if (!opts.options || opts.options.length === 0) {
      throw new Error(`[open-ui] select "${opts.id}": needs at least one option`);
    }
    super({ id: opts.id, role: opts.role ?? 'listbox', layout: opts.layout }, 'closed');
    this._options = opts.options.slice();
    this.caption = opts.label;
    this.index = new Signal<number>(this.clamp(opts.index ?? 0));
  }

  private clamp(i: number): number {
    if (!Number.isFinite(i)) return 0;
    return Math.max(0, Math.min(this._options.length - 1, Math.trunc(i)));
  }

  get options(): ReadonlyArray<SelectOption> {
    return this._options;
  }
  get value(): string {
    return this._options[this.index.get()]?.value ?? '';
  }
  get optionLabel(): string {
    return this._options[this.index.get()]?.label ?? '';
  }
  get isOpen(): boolean {
    return this.current === 'open';
  }

  openList(): void {
    if (this.current === 'closed') this.setState('open');
  }
  closeList(): void {
    if (this.current === 'open') this.setState('closed');
  }

  /** Choose by value (the view's list-item handler). Closes the list. */
  choose(value: string): void {
    const i = this._options.findIndex((o) => o.value === value);
    if (i < 0) return;
    if (i !== this.index.get()) {
      this.index.set(i);
      this.bus?.emit('optionSelected', { id: this.id, value: this.value, index: i });
    }
    if (this.current === 'open') this.setState('closed');
  }

  /** Jump to an index (clamped). Emits only if it changed. */
  setIndex(i: number): void {
    const next = this.clamp(i);
    if (next === this.index.get()) return;
    this.index.set(next);
    this.bus?.emit('optionSelected', { id: this.id, value: this.value, index: next });
  }

  /** Advance to the next option, wrapping (the view's cycle-on-tap handler). */
  cycle(): void {
    if (this._options.length < 2) return;
    this.setIndex((this.index.get() + 1) % this._options.length);
  }

  /** Replace the option list (e.g. when limits or locale change). */
  setOptions(options: SelectOption[], index = 0): void {
    if (!options.length) return;
    this._options = options.slice();
    this.index.set(this.clamp(index));
    this.bus?.emit('optionSelected', { id: this.id, value: this.value, index: this.index.get() });
  }

  enable(): void {
    if (this.current === 'disabled') this.setState('closed');
  }
  disable(): void {
    this.setState('disabled');
  }
}
