import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { SpinControl } from '../src/controls/SpinControl';
import { ButtonControl } from '../src/controls/ButtonControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('Control state machine', () => {
  it('starts in its declared initial state', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    expect(c.current).toBe('idle');
    expect(c.state.get()).toBe('idle');
  });

  it('derives `interactable` from the current state, never stores it (Charter P6)', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    expect(c.interactable).toBe(true); // idle
    c.setState('spinning');
    expect(c.interactable).toBe(false); // spinning is non-interactable
    c.setState('stop');
    expect(c.interactable).toBe(true);
    c.setState('disabled');
    expect(c.interactable).toBe(false);
  });

  it('transitions between legal states', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    c.busy();
    expect(c.current).toBe('spinning');
    c.idle();
    expect(c.current).toBe('idle');
    c.auto();
    expect(c.current).toBe('auto');
  });

  it('throws on an unknown target state (illegal states unrepresentable)', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    expect(() => c.setState('nope')).toThrowError(/unknown state "nope"/);
  });

  it('is a no-op (no transition fired) when setting the current state', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    const fn = vi.fn();
    c.onTransition(fn);
    c.setState('idle'); // already idle
    expect(fn).not.toHaveBeenCalled();
  });

  it('notifies onTransition subscribers with (transition, to, from)', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    const fn = vi.fn();
    const off = c.onTransition(fn);
    c.setState('spinning');
    expect(fn).toHaveBeenCalledTimes(1);
    const [transition, to, from] = fn.mock.calls[0];
    expect(to).toBe('spinning');
    expect(from).toBe('idle');
    expect(transition).toBe(c.states.spinning.transition);

    off();
    c.setState('idle');
    expect(fn).toHaveBeenCalledTimes(1); // unsubscribed
  });

  it('inspect() falls back to a null/idle report without a view', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    expect(c.inspect()).toEqual({ bounds: null, animating: false });
    c.viewInspect = () => ({ bounds: { x: 0, y: 0, width: 10, height: 10 }, animating: true });
    expect(c.inspect()).toEqual({ bounds: { x: 0, y: 0, width: 10, height: 10 }, animating: true });
  });

  it('dispose() tears down transition subs and the view hook (Charter P12)', () => {
    const c = new SpinControl({ layout }, new EventBus<OpenUIEvents>());
    const fn = vi.fn();
    c.onTransition(fn);
    c.viewInspect = () => ({ bounds: null, animating: true });
    c.dispose();
    expect(c.viewInspect).toBeUndefined();
    c.setState('spinning');
    expect(fn).not.toHaveBeenCalled(); // subs cleared
  });
});

describe('Control façade emits typed events', () => {
  it('SpinControl.activate() emits spinRequested only while interactable', () => {
    const bus = new EventBus<OpenUIEvents>();
    const spin = vi.fn();
    bus.on('spinRequested', spin);
    const c = new SpinControl({ layout }, bus);

    c.activate(); // idle -> interactable
    expect(spin).toHaveBeenCalledTimes(1);

    c.busy(); // spinning -> not interactable
    c.activate();
    expect(spin).toHaveBeenCalledTimes(1); // suppressed
  });

  it('SpinControl.activate() in `auto` emits skipRequested, not spinRequested', () => {
    const bus = new EventBus<OpenUIEvents>();
    const spin = vi.fn();
    const skip = vi.fn();
    bus.on('spinRequested', spin);
    bus.on('skipRequested', skip);
    const c = new SpinControl({ layout }, bus);
    c.auto();
    c.activate();
    expect(skip).toHaveBeenCalledTimes(1);
    expect(spin).not.toHaveBeenCalled();
  });

  it('ButtonControl emits buttonActivated with its id, and not while disabled', () => {
    const bus = new EventBus<OpenUIEvents>();
    const seen: string[] = [];
    bus.on('buttonActivated', ({ id }) => seen.push(id));
    const c = new ButtonControl({ id: 'rules', layout }, bus);
    c.activate();
    c.disable();
    c.activate(); // disabled -> suppressed
    c.enable();
    c.activate();
    expect(seen).toEqual(['rules', 'rules']);
  });
});
