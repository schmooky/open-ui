import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

/**
 * How tapping autoplay behaves:
 * - `'options'` — tap opens a picker (a bottom drawer) to choose a spin count, then Start.
 * - `'infinite'` — tap starts infinite autoplay immediately; tap again stops. No picker.
 */
export type AutoplayMode = 'options' | 'infinite';

export interface AutoplayOptions {
  id: string;
  layout: LayoutSpec;
  /** Count choices shown in the picker. Use Infinity for "∞". */
  options?: number[];
  /** Tap behavior. Default `'options'`. */
  mode?: AutoplayMode;
}

/**
 * Autoplay button. In `'options'` mode, tapping (idle) opens a count picker;
 * choosing a count starts autoplay. In `'infinite'` mode, tapping starts infinite
 * autoplay straight away. While active it shows the live remaining count (fed by
 * the host via `setCount`); tapping stops. open-ui owns the picker UI + the
 * displayed count; the host runs the actual spin loop.
 */
export class AutoplayControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true, transition: new Squish(0.94, 110) },
    picking: { interactable: true },
    active: { interactable: true, transition: new Pulse(1.06, 150) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };
  /** Remaining spins while active (Infinity = ∞). 0 when not active. */
  readonly count: Signal<number>;
  private _options: number[];
  /** Tap behavior (`'options'` opens the picker, `'infinite'` starts immediately). */
  mode: AutoplayMode;

  constructor(opts: AutoplayOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'button', layout: opts.layout }, 'idle');
    this._options = opts.options ?? [10, 25, 50, 100, Infinity];
    this.mode = opts.mode ?? 'options';
    this.count = new Signal<number>(0);
  }

  /** Count choices shown in the picker (Infinity allowed = ∞). */
  get options(): number[] {
    return this._options;
  }

  /** Replace the picker's count choices (e.g. when limits change). */
  setOptions(options: number[]): void {
    if (options.length) this._options = options.slice();
  }

  get isActive(): boolean {
    return this.current === 'active';
  }

  openPicker(): void {
    if (this.current === 'idle') this.setState('picking');
  }
  cancelPicker(): void {
    if (this.current === 'picking') this.setState('idle');
  }

  /** Choose a count from the picker → start autoplay. */
  pick(count: number): void {
    if (this.current !== 'picking') return;
    this.begin(count);
  }

  /** Start autoplay with a count (Infinity = ∞) from idle or the picker. */
  begin(count: number): void {
    if (this.current !== 'idle' && this.current !== 'picking') return;
    this.count.set(count);
    this.setState('active');
    this.bus?.emit('autoplayStarted', { count });
  }

  stop(): void {
    if (this.current !== 'active') return;
    this.count.set(0);
    this.setState('idle');
    this.bus?.emit('autoplayStopped', undefined);
  }

  /** Host updates the remaining count during play. Infinity is valid (∞); only
   *  NaN/non-number is rejected, so bad host data never corrupts the badge (P11). */
  setCount(n: number): void {
    if (typeof n !== 'number' || Number.isNaN(n)) return;
    this.count.set(n);
  }

  /** The view's tap handler. In `'infinite'` mode, idle starts straight away;
   *  in `'options'` mode, idle opens the picker. Active always stops. */
  press(): void {
    if (this.current === 'idle') {
      if (this.mode === 'infinite') this.begin(Infinity);
      else this.openPicker();
    } else if (this.current === 'active') this.stop();
    else if (this.current === 'picking') this.cancelPicker();
  }

  disable(): void {
    this.setState('disabled');
  }
  enable(): void {
    if (this.current === 'disabled') this.setState('idle');
  }
}
