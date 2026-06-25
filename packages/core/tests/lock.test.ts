import { describe, it, expect } from 'vitest';
import { OpenUI } from '../src/OpenUI';

describe('ref-counted input lock (Charter P6/G7)', () => {
  it('stays locked until the ref count returns to zero', () => {
    const ui = new OpenUI();
    expect(ui.locked.get()).toBe(false);
    ui.lock();
    ui.lock();
    expect(ui.locked.get()).toBe(true);
    ui.unlock();
    expect(ui.locked.get()).toBe(true); // one still outstanding
    ui.unlock();
    expect(ui.locked.get()).toBe(false);
  });

  it('unlock past zero is a no-op (cannot go negative)', () => {
    const ui = new OpenUI();
    ui.unlock();
    expect(ui.locked.get()).toBe(false);
  });

  it('while locked, every control reports not-interactable via the derived getter', () => {
    const ui = new OpenUI();
    expect(ui.spin.interactable).toBe(true);
    expect(ui.betPlus.interactable).toBe(true);
    ui.lock();
    for (const c of ui.all()) expect(c.interactable).toBe(false);
    ui.unlock();
    expect(ui.spin.interactable).toBe(true);
  });

  it('is instance-scoped — locking one HUD never bleeds into another', () => {
    const a = new OpenUI();
    const b = new OpenUI();
    a.lock();
    expect(a.spin.interactable).toBe(false);
    expect(b.spin.interactable).toBe(true); // unaffected
  });

  it('a control in `auto` can still slam-stop while locked (skip path bypasses interactable)', () => {
    const ui = new OpenUI();
    let skips = 0;
    ui.on('skipRequested', () => (skips += 1));
    ui.spin.auto();
    ui.lock();
    expect(ui.spin.interactable).toBe(false);
    ui.spin.activate(); // auto + activate ⇒ skipRequested regardless of the lock
    expect(skips).toBe(1);
  });
});

describe('OpenUI.dispose (Charter P12)', () => {
  it('tears down subscriptions + controls so nothing leaks', () => {
    const ui = new OpenUI();
    const spin = ui.spin;
    expect(ui.all().length).toBeGreaterThan(0);
    ui.dispose();
    expect(ui.all().length).toBe(0); // control registry cleared

    // the per-control onTransition → stateChanged wiring is gone
    let fired = 0;
    ui.on('stateChanged', () => (fired += 1));
    spin.setState('spinning');
    expect(fired).toBe(0);
  });
});
