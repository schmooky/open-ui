import type { EventBus } from './events';
import type { OpenUIEvents } from './types';

export interface LoggedEvent {
  t: number;
  type: keyof OpenUIEvents;
  payload: unknown;
}

export interface EventLogOptions {
  /** Max entries kept (ring buffer). Default 200. */
  capacity?: number;
  /** Monotonic clock; defaults to performance.now/Date.now. Injectable for tests. */
  now?: () => number;
}

const ALL_EVENTS: Array<keyof OpenUIEvents> = [
  'spinRequested',
  'skipRequested',
  'stateChanged',
  'buttonActivated',
  'valueChanged',
  'panelToggled',
  'toggled',
  'optionSelected',
  'autoplayStarted',
  'autoplayStopped',
  'cardActivated',
  'localeChanged',
];

/**
 * An opt-in ring buffer over the one typed event bus — backs `BootedHud.events`
 * and the dev `window.__OPENUI__.events`, so e2e can assert "exactly one
 * spinRequested fired during the round" without timing guesses (Charter P10/G6).
 */
export class EventLog {
  private readonly buf: LoggedEvent[] = [];
  private readonly cap: number;
  private readonly clock: () => number;
  private readonly disposers: Array<() => void> = [];

  constructor(bus: EventBus<OpenUIEvents>, opts: EventLogOptions = {}) {
    this.cap = opts.capacity ?? 200;
    this.clock = opts.now ?? defaultNow;
    for (const type of ALL_EVENTS) {
      this.disposers.push(bus.on(type, (payload) => this.record(type, payload)));
    }
  }

  private record(type: keyof OpenUIEvents, payload: unknown): void {
    this.buf.push({ t: this.clock(), type, payload });
    if (this.buf.length > this.cap) this.buf.shift();
  }

  /** The most recent payload of `type`, or undefined. */
  last<K extends keyof OpenUIEvents>(type: K): OpenUIEvents[K] | undefined {
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (this.buf[i]!.type === type) return this.buf[i]!.payload as OpenUIEvents[K];
    }
    return undefined;
  }

  /** How many of `type` are in the buffer. */
  count(type: keyof OpenUIEvents): number {
    let n = 0;
    for (const e of this.buf) if (e.type === type) n += 1;
    return n;
  }

  /** Every event at or after timestamp `t`, in order. */
  since(t: number): LoggedEvent[] {
    return this.buf.filter((e) => e.t >= t);
  }

  clear(): void {
    this.buf.length = 0;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}

function defaultNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
