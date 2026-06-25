import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { AutoplayControl } from '../src/controls/AutoplayControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('AutoplayControl modes', () => {
  it("'options' mode (default): a tap opens the picker, not autoplay", () => {
    const bus = new EventBus<OpenUIEvents>();
    const started = vi.fn();
    bus.on('autoplayStarted', started);
    const a = new AutoplayControl({ id: 'autoplay', layout }, bus);
    expect(a.mode).toBe('options');
    a.press();
    expect(a.current).toBe('picking');
    expect(started).not.toHaveBeenCalled();
    a.pick(25);
    expect(a.isActive).toBe(true);
    expect(a.count.get()).toBe(25);
    expect(started).toHaveBeenCalledWith({ count: 25 });
  });

  it("'infinite' mode: a tap starts infinite straight away; tap again stops", () => {
    const bus = new EventBus<OpenUIEvents>();
    const started = vi.fn();
    const stopped = vi.fn();
    bus.on('autoplayStarted', started);
    bus.on('autoplayStopped', stopped);
    const a = new AutoplayControl({ id: 'autoplay', layout, mode: 'infinite' }, bus);
    a.press();
    expect(a.isActive).toBe(true);
    expect(a.count.get()).toBe(Infinity);
    expect(started).toHaveBeenCalledWith({ count: Infinity });
    a.press();
    expect(a.isActive).toBe(false);
    expect(stopped).toHaveBeenCalled();
  });

  it('begin() starts from idle without the picker', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(50);
    expect(a.isActive).toBe(true);
    expect(a.count.get()).toBe(50);
  });

  it('setCount tolerates Infinity but rejects NaN (never corrupts the badge)', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(10);
    a.setCount(Infinity);
    expect(a.count.get()).toBe(Infinity);
    a.setCount(NaN);
    expect(a.count.get()).toBe(Infinity); // unchanged
  });
});
