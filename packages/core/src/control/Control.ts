import { Signal, type Dispose } from '../signal';
import type { Transition } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { Rect } from '../types';

/** One state of a control: is it interactable, and what plays on entry. */
export interface StateDef {
  interactable: boolean;
  transition?: Transition;
}

export type StateMap = Record<string, StateDef>;

export interface ControlOptions {
  id: string;
  role: string;
  layout: LayoutSpec;
}

/** What a view reports back for introspection. Set by the renderer's view. */
export type ViewInspect = () => { bounds: Rect | null; animating: boolean };

/**
 * Base of every control: a finite state machine that is the single source of
 * truth for look, interactivity, AND tests (Charter P5/P6/P12).
 * Renderer-agnostic — it knows nothing about Pixi or the DOM.
 */
export abstract class Control {
  readonly id: string;
  readonly role: string;
  layout: LayoutSpec;

  /** Declared by the subclass: the legal states and their transitions. */
  abstract readonly states: StateMap;

  /** Current state name, observable. */
  readonly state: Signal<string>;

  /** The renderer sets this so `inspect()` can report bounds/animation. */
  viewInspect?: ViewInspect;

  /**
   * Optional host gate (e.g. a ref-counted input lock). When set, the control is
   * interactable only if its state allows it AND the gate returns true. Set per
   * instance — by OpenUI on register — so multiple HUDs on one page never share
   * lock state. Interactability stays *derived*, never stored (Charter P6).
   */
  gate?: () => boolean;

  protected readonly disposers: Dispose[] = [];
  private readonly transitionSubs = new Set<(t: Transition | undefined, to: string, from: string) => void>();

  constructor(opts: ControlOptions, initial: string) {
    this.id = opts.id;
    this.role = opts.role;
    this.layout = opts.layout;
    this.state = new Signal<string>(initial);
  }

  get current(): string {
    return this.state.get();
  }

  /** Derived, never stored (Charter P6). Folds in the optional host gate. */
  get interactable(): boolean {
    const base = this.states[this.current]?.interactable ?? false;
    return base && (this.gate?.() ?? true);
  }

  /** Transition to a new state. Throws on unknown states (illegal states unrepresentable). */
  setState(to: string): void {
    if (!(to in this.states)) {
      throw new Error(`[open-ui] control "${this.id}": unknown state "${to}"`);
    }
    const from = this.current;
    if (to === from) return;
    this.state.set(to);
    const t = this.states[to]?.transition;
    for (const fn of [...this.transitionSubs]) fn(t, to, from);
  }

  /** The renderer subscribes to play the entry transition for each state change. */
  onTransition(fn: (t: Transition | undefined, to: string, from: string) => void): Dispose {
    this.transitionSubs.add(fn);
    return () => {
      this.transitionSubs.delete(fn);
    };
  }

  inspect(): { bounds: Rect | null; animating: boolean } {
    return this.viewInspect?.() ?? { bounds: null, animating: false };
  }

  /** Leak-free teardown (Charter P12). */
  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.transitionSubs.clear();
    this.viewInspect = undefined;
  }
}
