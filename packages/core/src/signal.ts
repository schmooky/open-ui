/**
 * Zero-dependency reactive primitives — the "M" substrate.
 * Deliberately tiny: a value box you can subscribe to, plus an effect helper.
 * No framework, no global graph, no magic. This is the whole reactivity story.
 */

export type Dispose = () => void;

export interface Subscribable {
  subscribe(fn: (value: never) => void): Dispose;
}

export class Signal<T> {
  private _value: T;
  private readonly subs = new Set<(value: T) => void>();

  constructor(initial: T) {
    this._value = initial;
  }

  get(): T {
    return this._value;
  }

  set(next: T): void {
    if (Object.is(next, this._value)) return;
    this._value = next;
    // copy to tolerate (un)subscribe during emit
    for (const fn of [...this.subs]) fn(next);
  }

  /** Mutate-in-place then notify (for objects whose identity is stable). */
  update(mutate: (value: T) => void): void {
    mutate(this._value);
    for (const fn of [...this.subs]) fn(this._value);
  }

  subscribe(fn: (value: T) => void): Dispose {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  get size(): number {
    return this.subs.size;
  }
}

/**
 * Run `fn` once now and again whenever any dependency changes.
 * Dependencies are explicit (no auto-tracking) — keeps the model trivial and predictable.
 */
export function effect(fn: () => void, deps: Subscribable[]): Dispose {
  const run = (): void => fn();
  const disposers = deps.map((d) => d.subscribe(run as (value: never) => void));
  run();
  return () => {
    for (const d of disposers) d();
  };
}
