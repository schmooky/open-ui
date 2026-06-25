import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/events';
import { ControlRegistry } from '../src/registry/ControlRegistry';
import { SelectControl } from '../src/controls/SelectControl';
import type { OpenUIEvents } from '../src/types';
import type { BlockSpec } from '../src/spec/types';

const bus = () => new EventBus<OpenUIEvents>();

describe('ControlRegistry (swap-by-class, Charter P7)', () => {
  it('defaults() resolves every control-bearing block kind', () => {
    const r = ControlRegistry.defaults();
    expect(r.resolve({ kind: 'slider', id: 'a' }, bus())).toBeTruthy();
    expect(r.resolve({ kind: 'toggle', id: 'b' }, bus())).toBeTruthy();
    expect(r.resolve({ kind: 'button', id: 'c', label: 'X' }, bus())).toBeTruthy();
    expect(r.resolve({ kind: 'select', id: 'd', options: [{ value: 'x', label: 'X' }] }, bus())).toBeInstanceOf(SelectControl);
    expect(r.resolve({ kind: 'stepper', id: 'e', levels: [1, 2] }, bus())).toBeTruthy();
    expect(r.resolve({ kind: 'value', id: 'f' }, bus())).toBeTruthy();
  });

  it('returns null for non-control and unknown kinds', () => {
    const r = ControlRegistry.defaults();
    expect(r.resolve({ kind: 'text', id: 't', text: 'hi' }, bus())).toBeNull();
    expect(r.resolve({ kind: 'nope' } as unknown as BlockSpec, bus())).toBeNull();
  });

  it('supports a custom factory override', () => {
    const r = ControlRegistry.defaults();
    let made = 0;
    r.register('select', (b, busx) => {
      made += 1;
      return b.kind === 'select'
        ? new SelectControl({ id: b.id, layout: { anchor: 'center' }, options: b.options }, busx)
        : null;
    });
    r.resolve({ kind: 'select', id: 'q', options: [{ value: 'a', label: 'A' }] }, bus());
    expect(made).toBe(1);
  });
});
