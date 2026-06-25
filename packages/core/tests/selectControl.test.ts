import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { SelectControl } from '../src/controls/SelectControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;
const opts = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
];

describe('SelectControl', () => {
  it('throws on empty options (required-by-contract, Charter B7)', () => {
    expect(() => new SelectControl({ id: 'lang', layout, options: [] })).toThrowError(/at least one option/);
  });

  it('starts closed on the given index with role listbox', () => {
    const s = new SelectControl({ id: 'lang', layout, options: opts, index: 1 });
    expect(s.current).toBe('closed');
    expect(s.role).toBe('listbox');
    expect(s.value).toBe('de');
    expect(s.optionLabel).toBe('Deutsch');
  });

  it('opens and closes', () => {
    const s = new SelectControl({ id: 'lang', layout, options: opts });
    s.openList();
    expect(s.isOpen).toBe(true);
    s.closeList();
    expect(s.isOpen).toBe(false);
  });

  it('choose() sets value, closes, and emits its own typed optionSelected', () => {
    const bus = new EventBus<OpenUIEvents>();
    const seen = vi.fn();
    bus.on('optionSelected', seen);
    const s = new SelectControl({ id: 'lang', layout, options: opts }, bus);
    s.openList();
    s.choose('fr');
    expect(s.value).toBe('fr');
    expect(s.isOpen).toBe(false);
    expect(seen).toHaveBeenCalledWith({ id: 'lang', value: 'fr', index: 2 });
  });

  it('choosing the current value closes without re-emitting', () => {
    const bus = new EventBus<OpenUIEvents>();
    const seen = vi.fn();
    bus.on('optionSelected', seen);
    const s = new SelectControl({ id: 'lang', layout, options: opts }, bus);
    s.openList();
    s.choose('en'); // already at index 0
    expect(s.isOpen).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });

  it('setIndex clamps and cycle wraps', () => {
    const s = new SelectControl({ id: 'lang', layout, options: opts });
    s.setIndex(99);
    expect(s.value).toBe('fr'); // clamped to last
    s.setIndex(-5);
    expect(s.value).toBe('en'); // clamped to first
    s.cycle();
    expect(s.value).toBe('de');
    s.cycle();
    s.cycle();
    expect(s.value).toBe('en'); // wrapped around
  });

  it('disabled is a non-interactable dead-end until enable()', () => {
    const s = new SelectControl({ id: 'lang', layout, options: opts });
    s.disable();
    expect(s.interactable).toBe(false);
    s.openList();
    expect(s.isOpen).toBe(false); // openList only works from closed
    s.enable();
    expect(s.current).toBe('closed');
    expect(s.interactable).toBe(true);
  });

  it('setOptions replaces the list and re-emits the resolved selection', () => {
    const bus = new EventBus<OpenUIEvents>();
    const seen = vi.fn();
    bus.on('optionSelected', seen);
    const s = new SelectControl({ id: 'q', layout, options: opts }, bus);
    s.setOptions([{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }], 1);
    expect(s.value).toBe('high');
    expect(seen).toHaveBeenCalledWith({ id: 'q', value: 'high', index: 1 });
  });
});
