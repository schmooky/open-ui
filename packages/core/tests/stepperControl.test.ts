import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { StepperControl } from '../src/controls/StepperControl';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('StepperControl', () => {
  it('inc/dec clamp at the ends and drive canInc/canDec', () => {
    const s = new StepperControl({ id: 'bet', layout, levels: [1, 2, 5], index: 0 });
    expect(s.value).toBe(1);
    expect(s.canDec).toBe(false);
    expect(s.canInc).toBe(true);
    s.inc();
    expect(s.value).toBe(2);
    s.inc();
    s.inc();
    expect(s.value).toBe(5);
    expect(s.canInc).toBe(false);
    s.dec();
    expect(s.value).toBe(2);
  });

  it('setLevels emits valueChanged only when the resolved value actually changes', () => {
    const bus = new EventBus<OpenUIEvents>();
    const seen = vi.fn();
    bus.on('valueChanged', seen);
    const s = new StepperControl({ id: 'bet', layout, levels: [0.5, 1, 2], index: 1 }, bus); // value 1

    // same resolved value (1 at index 0 of the new levels) → NO spurious emit
    s.setLevels([1, 5, 10], 0);
    expect(s.value).toBe(1);
    expect(seen).not.toHaveBeenCalled();

    // value genuinely changes → emit exactly once
    s.setLevels([1, 5, 10], 2);
    expect(s.value).toBe(10);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenLastCalledWith({ id: 'bet', value: 10 });
  });
});
