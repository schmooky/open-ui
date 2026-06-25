import { describe, it, expect, vi } from 'vitest';
import { Signal, effect } from '../src/signal';

describe('Signal', () => {
  it('holds and returns its current value', () => {
    const s = new Signal(1);
    expect(s.get()).toBe(1);
    s.set(2);
    expect(s.get()).toBe(2);
  });

  it('notifies subscribers on change', () => {
    const s = new Signal('a');
    const seen: string[] = [];
    s.subscribe((v) => seen.push(v));
    s.set('b');
    s.set('c');
    expect(seen).toEqual(['b', 'c']);
  });

  it('skips notification when the value is Object.is-equal', () => {
    const s = new Signal(0);
    const fn = vi.fn();
    s.subscribe(fn);
    s.set(0); // no change
    expect(fn).not.toHaveBeenCalled();
    s.set(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications', () => {
    const s = new Signal(0);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set(1);
    off();
    s.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.size).toBe(0);
  });

  it('tolerates (un)subscribing during emit', () => {
    const s = new Signal(0);
    const seen: number[] = [];
    // a subscriber that removes itself on first fire must not corrupt iteration
    const off = s.subscribe((v) => {
      seen.push(v);
      off();
    });
    s.subscribe((v) => seen.push(v * 10));
    s.set(1);
    s.set(2);
    expect(seen).toEqual([1, 10, 20]);
  });

  it('update() mutates in place then notifies', () => {
    const s = new Signal({ count: 0 });
    const fn = vi.fn();
    s.subscribe(fn);
    s.update((v) => {
      v.count = 5;
    });
    expect(s.get().count).toBe(5);
    expect(fn).toHaveBeenCalledWith({ count: 5 });
  });
});

describe('effect', () => {
  it('runs once immediately and on every dependency change', () => {
    const a = new Signal(1);
    const b = new Signal(2);
    const runs: number[] = [];
    const dispose = effect(() => runs.push(a.get() + b.get()), [a, b]);
    expect(runs).toEqual([3]); // ran once now
    a.set(10);
    b.set(20);
    expect(runs).toEqual([3, 12, 30]);
    dispose();
    a.set(0);
    expect(runs).toEqual([3, 12, 30]); // disposed: no more runs
  });

  it('leaves no dangling subscriptions after dispose (Charter P12)', () => {
    const a = new Signal(1);
    const dispose = effect(() => void a.get(), [a]);
    expect(a.size).toBe(1);
    dispose();
    expect(a.size).toBe(0);
  });
});
