import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/events';
import { buildPanel, buttonBlocks } from '../src/spec/buildPanel';
import { PanelControl } from '../src/controls/PanelControl';
import { SelectControl } from '../src/controls/SelectControl';
import type { OpenUIEvents } from '../src/types';
import type { PanelSpec } from '../src/spec/types';

const spec: PanelSpec = {
  id: 'settings',
  variant: 'popover',
  blocks: [
    { kind: 'slider', id: 'music', label: 'Music', initial: 0.7 },
    { kind: 'text', id: 'note', text: 'hi' },
    {
      kind: 'group',
      id: 'audio',
      children: [
        { kind: 'toggle', id: 'mute' },
        { kind: 'select', id: 'lang', options: [{ value: 'en', label: 'EN' }] },
      ],
    },
    { kind: 'button', id: 'close', label: 'Close', action: 'closePanel' },
  ],
};

describe('buildPanel', () => {
  it('builds a PanelControl + one control per leaf, flattened in render order', () => {
    const built = buildPanel(spec, new EventBus<OpenUIEvents>());
    expect(built.panel).toBeInstanceOf(PanelControl);
    expect(built.panel.variant).toBe('popover');
    // text skipped; group flattened in order
    expect(built.controls.map((c) => c.id)).toEqual(['music', 'mute', 'lang', 'close']);
    expect(built.controls.find((c) => c.id === 'lang')).toBeInstanceOf(SelectControl);
  });

  it('buttonBlocks finds buttons through groups', () => {
    expect(buttonBlocks(spec.blocks).map((b) => b.id)).toEqual(['close']);
  });
});
