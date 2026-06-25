import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/events';
import { EventLog } from '../src/EventLog';
import type { OpenUIEvents } from '../src/types';

describe('EventLog (Charter P10/G6)', () => {
  it('records last / count / since against a sequence of bus emits', () => {
    let clock = 0;
    const bus = new EventBus<OpenUIEvents>();
    const log = new EventLog(bus, { now: () => clock });

    clock = 1;
    bus.emit('spinRequested', undefined);
    clock = 2;
    bus.emit('valueChanged', { id: 'bet-stepper', value: 2 });
    clock = 3;
    bus.emit('valueChanged', { id: 'bet-stepper', value: 5 });

    expect(log.count('valueChanged')).toBe(2);
    expect(log.count('spinRequested')).toBe(1);
    expect(log.last('valueChanged')).toEqual({ id: 'bet-stepper', value: 5 });
    expect(log.since(2).map((e) => e.type)).toEqual(['valueChanged', 'valueChanged']);
  });

  it('caps the ring buffer at capacity', () => {
    const bus = new EventBus<OpenUIEvents>();
    const log = new EventLog(bus, { capacity: 3 });
    for (let i = 0; i < 10; i++) bus.emit('buttonActivated', { id: `b${i}` });
    expect(log.count('buttonActivated')).toBe(3);
    expect(log.last('buttonActivated')).toEqual({ id: 'b9' });
  });

  it('clear() empties it and dispose() stops recording', () => {
    const bus = new EventBus<OpenUIEvents>();
    const log = new EventLog(bus);
    bus.emit('spinRequested', undefined);
    log.clear();
    expect(log.count('spinRequested')).toBe(0);
    log.dispose();
    bus.emit('spinRequested', undefined);
    expect(log.count('spinRequested')).toBe(0);
  });
});
