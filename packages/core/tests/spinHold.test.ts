import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { SpinControl } from '../src/controls/SpinControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'bottom-center' } as const;

describe('SpinControl hold-to-spin', () => {
  it('does nothing on hold when holdToSpin is off (default)', () => {
    const bus = new EventBus<OpenUIEvents>();
    const started = vi.fn();
    bus.on('holdSpinStarted', started);
    const s = new SpinControl({ layout }, bus);
    expect(s.holdToSpin).toBe(false);
    expect(s.holdBegin()).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });

  it('emits holdSpinStarted/Stopped when enabled and interactable', () => {
    const bus = new EventBus<OpenUIEvents>();
    const started = vi.fn();
    const stopped = vi.fn();
    bus.on('holdSpinStarted', started);
    bus.on('holdSpinStopped', stopped);
    const s = new SpinControl({ layout, holdToSpin: true }, bus);
    expect(s.holdBegin()).toBe(true);
    expect(started).toHaveBeenCalledOnce();
    s.holdEnd();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('refuses to begin a hold while not interactable (e.g. spinning)', () => {
    const bus = new EventBus<OpenUIEvents>();
    const started = vi.fn();
    bus.on('holdSpinStarted', started);
    const s = new SpinControl({ layout, holdToSpin: true }, bus);
    s.busy(); // → spinning, not interactable
    expect(s.holdBegin()).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });
});
