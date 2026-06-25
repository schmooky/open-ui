import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { TurboControl } from '../src/controls/TurboControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('TurboControl', () => {
  it('defaults to a 2-mode off/on toggle', () => {
    const t = new TurboControl({ id: 'turbo', layout });
    expect(t.modes).toEqual(['off', 'on']);
    expect(t.modeCount).toBe(2);
    expect(t.mode).toBe('off');
    expect(t.isOn).toBe(false);
    t.cycle();
    expect(t.mode).toBe('on');
    expect(t.isOn).toBe(true);
    t.cycle();
    expect(t.mode).toBe('off'); // wraps
  });

  it('runs as a 3-mode switcher and wraps off→turbo→super→off', () => {
    const t = new TurboControl({ id: 'turbo', layout, modes: ['off', 'turbo', 'super'] });
    expect(t.modeCount).toBe(3);
    t.cycle();
    expect(t.mode).toBe('turbo');
    expect(t.isOn).toBe(true);
    t.cycle();
    expect(t.mode).toBe('super');
    t.cycle();
    expect(t.mode).toBe('off');
    expect(t.isOn).toBe(false);
  });

  it('emits turboChanged AND a back-compat toggled on every change', () => {
    const bus = new EventBus<OpenUIEvents>();
    const turbo = vi.fn();
    const toggled = vi.fn();
    bus.on('turboChanged', turbo);
    bus.on('toggled', toggled);
    const t = new TurboControl({ id: 'turbo', layout, modes: ['off', 'turbo', 'super'] }, bus);
    t.cycle();
    expect(turbo).toHaveBeenCalledWith({ id: 'turbo', mode: 'turbo', index: 1 });
    expect(toggled).toHaveBeenCalledWith({ id: 'turbo', on: true });
    t.cycle();
    t.cycle(); // back to off
    expect(toggled).toHaveBeenLastCalledWith({ id: 'turbo', on: false });
  });

  it('setIndex clamps; set() is the 2-mode shortcut', () => {
    const t = new TurboControl({ id: 'turbo', layout, modes: ['off', 'turbo', 'super'] });
    t.setIndex(99);
    expect(t.mode).toBe('super'); // clamped to last
    t.set(false);
    expect(t.mode).toBe('off');
    t.set(true);
    expect(t.mode).toBe('turbo'); // index 1
  });

  it('setModes switches the ladder at runtime and clamps the index', () => {
    const t = new TurboControl({ id: 'turbo', layout, modes: ['off', 'turbo', 'super'] });
    t.setIndex(2); // super
    t.setModes(['off', 'on']); // shrink
    expect(t.modes).toEqual(['off', 'on']);
    expect(t.index.get()).toBe(1); // clamped from 2 → 1
    expect(t.mode).toBe('on');
  });

  it('disable() is a non-interactable dead-end until enable()', () => {
    const t = new TurboControl({ id: 'turbo', layout });
    t.disable();
    expect(t.current).toBe('disabled');
    expect(t.interactable).toBe(false);
    t.cycle(); // ignored while disabled
    expect(t.current).toBe('disabled');
    t.enable();
    expect(t.interactable).toBe(true);
    expect(t.mode).toBe('off');
  });
});
