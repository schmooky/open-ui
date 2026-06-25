import { describe, it, expect } from 'vitest';
import { OpenUI } from '../src/OpenUI';
import type { ControlSnapshot } from '../src/types';

describe('OpenUI.snapshot()', () => {
  it('returns one serializable record per registered control (Charter P10)', () => {
    const ui = new OpenUI();
    const snap = ui.snapshot();

    expect(Array.isArray(snap)).toBe(true);
    expect(snap.length).toBe(ui.all().length);

    for (const s of snap) {
      expect(s).toEqual({
        id: expect.any(String),
        role: expect.any(String),
        state: expect.any(String),
        interactable: expect.any(Boolean),
        bounds: null, // no renderer attached => no measured bounds
        animating: false,
      } satisfies Record<keyof ControlSnapshot, unknown>);
    }
  });

  it('reflects live control state in subsequent snapshots', () => {
    const ui = new OpenUI();
    const before = ui.snapshot().find((s) => s.id === 'spin');
    expect(before).toMatchObject({ state: 'idle', interactable: true });

    ui.spin.busy();
    const after = ui.snapshot().find((s) => s.id === 'spin');
    expect(after).toMatchObject({ state: 'spinning', interactable: false });
  });

  it('matches the documented initial control surface', () => {
    const ui = new OpenUI();
    // Normalize to a stable, renderer-independent projection so the snapshot is
    // about the state machine, not about pixel bounds.
    const surface = ui
      .snapshot()
      .map(({ id, role, state, interactable }) => ({ id, role, state, interactable }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(surface).toMatchSnapshot();
  });
});
