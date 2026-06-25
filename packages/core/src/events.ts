import type { Dispose } from './signal';

/** A typed event map: event name -> payload type. */
export type EventMap = Record<string, unknown>;

/**
 * One typed event bus. Period. (Charter B1.)
 * No magic strings sprinkled around the codebase; payloads are checked.
 */
export class EventBus<E extends EventMap> {
  private readonly map = new Map<keyof E, Set<(payload: unknown) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): Dispose {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    const wrapped = fn as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
