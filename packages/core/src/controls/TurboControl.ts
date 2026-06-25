import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface TurboOptions {
  id: string;
  layout: LayoutSpec;
  /**
   * The ordered modes this switcher cycles through. The FIRST mode is "off".
   * Two modes (`['off','on']`) behave exactly like a plain on/off toggle; three
   * (`['off','turbo','super']`) make a 3-mode switcher. Default `['off','on']`.
   */
  modes?: string[];
  /** Initial mode index. Default 0 (off). */
  index?: number;
}

/**
 * Turbo switcher. Each press advances to the next mode and wraps back to "off"
 * — so the SAME control is a 2-mode toggle or a 3-mode (off / turbo / super)
 * switcher purely by configuration. The current FSM state IS the current mode,
 * so look + interactivity + tests all read from one place (Charter P5).
 *
 * Emits both `turboChanged` (mode + index, the full story) and `toggled`
 * (`on` = "any mode past off") so existing 2-mode listeners keep working.
 */
export class TurboControl extends Control {
  states: StateMap;
  private _modes: string[];
  /** Current mode index, observable (0 = off). */
  readonly index: Signal<number>;

  constructor(opts: TurboOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    const modes = opts.modes?.length ? opts.modes.slice() : ['off', 'on'];
    const start = clampIndex(opts.index ?? 0, modes.length);
    super({ id: opts.id, role: 'switch', layout: opts.layout }, modes[start]!);
    this._modes = modes;
    this.states = TurboControl.buildStates(modes);
    this.index = new Signal<number>(start);
  }

  private static buildStates(modes: string[]): StateMap {
    const states: StateMap = {};
    modes.forEach((m, i) => {
      // "off" squishes in; engaged modes pulse, brighter further up the ladder.
      states[m] = { interactable: true, transition: i === 0 ? new Squish(0.92, 110) : new Pulse(1.06 + i * 0.02, 150) };
    });
    states.disabled = { interactable: false, transition: new Fade(0.4, 150) };
    return states;
  }

  /** The ordered modes (the first is "off"). */
  get modes(): string[] {
    return this._modes;
  }
  /** Number of modes (2 = toggle, 3 = three-mode switcher). */
  get modeCount(): number {
    return this._modes.length;
  }
  /** The current mode name. */
  get mode(): string {
    return this.current;
  }
  /** True for any mode past "off" — the 2-mode `isOn` semantics, preserved. */
  get isOn(): boolean {
    return this.current !== 'disabled' && this.index.get() > 0;
  }

  /** Replace the mode ladder (e.g. switch a game from 2-mode to 3-mode at runtime). */
  setModes(modes: string[]): void {
    if (!modes.length) return;
    this._modes = modes.slice();
    this.states = TurboControl.buildStates(this._modes);
    this.goTo(clampIndex(this.index.get(), this._modes.length), false);
  }

  /** Advance to the next mode, wrapping back to "off". The view's tap handler. */
  cycle(): void {
    if (this.current === 'disabled') return;
    this.goTo((this.index.get() + 1) % this._modes.length);
  }

  /** Jump to a specific mode index (clamped). */
  setIndex(i: number): void {
    if (this.current === 'disabled') return;
    this.goTo(clampIndex(i, this._modes.length));
  }

  /** 2-mode convenience: off (index 0) or on (index 1). */
  set(on: boolean): void {
    this.goTo(on ? Math.min(1, this._modes.length - 1) : 0);
  }
  /** Alias kept so old `toggle()` callers compile — same as `cycle()`. */
  toggle(): void {
    this.cycle();
  }

  private goTo(i: number, emit = true): void {
    const next = this._modes[i]!;
    const changed = next !== this.current || i !== this.index.get();
    this.index.set(i);
    this.setState(next); // no-op transition if same state name, but index already synced
    if (emit && changed) {
      this.bus?.emit('turboChanged', { id: this.id, mode: next, index: i });
      this.bus?.emit('toggled', { id: this.id, on: i > 0 });
    }
  }

  enable(): void {
    if (this.current === 'disabled') this.goTo(this.index.get(), false);
  }
  disable(): void {
    this.setState('disabled');
  }
}

function clampIndex(i: number, len: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(Math.floor(i), len - 1));
}
