import { describe, it, expect } from 'vitest';
import { validateSpec } from '../src/spec/validateSpec';
import { buildBlocks } from '../src/spec/buildPanel';
import { EventBus } from '../src/events';
import type { OpenUIEvents } from '../src/types';

describe('rules content blocks', () => {
  it('accepts heading/callout/stat-grid/steps/paytable', () => {
    const r = validateSpec({
      panels: [
        {
          id: 'rules',
          variant: 'modal',
          blocks: [
            { kind: 'heading', id: 'h', text: 'About' },
            { kind: 'callout', id: 'c', tone: 'bonus', text: 'Free spins!' },
            { kind: 'stat-grid', id: 'g', items: [{ label: 'RTP', value: '96%' }] },
            { kind: 'steps', id: 's', items: ['Spin', 'Win'] },
            { kind: 'paytable', id: 'p', rows: [{ symbol: 'A', payouts: '10x', icon: 'https://placehold.co/64x64.png' }] },
            { kind: 'image', id: 'img', src: 'https://placehold.co/440x110.png', width: 440, height: 110 },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('flags an image block with no src', () => {
    const r = validateSpec({ rules: [{ kind: 'image', id: 'i', src: '' }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('image-src');
  });

  it('warns (not errors) on empty content blocks', () => {
    const codes = validateSpec({
      panels: [
        {
          id: 'r',
          variant: 'modal',
          blocks: [
            { kind: 'stat-grid', id: 'g', items: [] },
            { kind: 'steps', id: 's', items: [] },
            { kind: 'paytable', id: 'p', rows: [] },
          ],
        },
      ],
    });
    expect(codes.ok).toBe(true); // warnings don't fail the spec
    const c = codes.issues.map((i) => i.code);
    expect(c).toContain('empty-grid');
    expect(c).toContain('empty-steps');
    expect(c).toContain('empty-paytable');
  });

  it('static content blocks carry no control (buildBlocks skips them)', () => {
    const controls = buildBlocks(
      [
        { kind: 'heading', id: 'h', text: 'About' },
        { kind: 'text', id: 't', text: 'hi' },
        { kind: 'callout', id: 'c', text: 'note' },
        { kind: 'toggle', id: 'mute' }, // the only control
      ],
      new EventBus<OpenUIEvents>(),
    );
    expect(controls.map((x) => x.id)).toEqual(['mute']);
  });

  it('flags an image block with a non-positive dimension', () => {
    const r = validateSpec({ rules: [{ kind: 'image', id: 'i', src: 'x.png', width: 0, height: 64 }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('image-dims');
  });

  it('accepts the extended palette: subheading/media/cards/table/legal/divider', () => {
    const r = validateSpec({
      rules: [
        { kind: 'subheading', id: 'sh', text: 'Features' },
        { kind: 'media', id: 'm', src: 'https://placehold.co/320x200.png', side: 'left', title: 'Free Spins', text: 'Land 3 **Scatters**.' },
        { kind: 'cards', id: 'cd', items: [{ icon: 'https://placehold.co/72x72.png', title: 'Wild', text: 'Substitutes.' }] },
        { kind: 'table', id: 'tb', columns: ['Symbol', '3', '4', '5'], rows: [['Wild', '5x', '20x', '50x']] },
        { kind: 'legal', id: 'lg', text: 'Play responsibly. 18+.' },
        { kind: 'divider', id: 'dv' },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('flags a media block with no src', () => {
    const r = validateSpec({ rules: [{ kind: 'media', id: 'm', src: '', text: 'hi' }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('image-src');
  });

  it('warns (not errors) on empty table/cards blocks', () => {
    const r = validateSpec({
      rules: [
        { kind: 'table', id: 'tb', rows: [] },
        { kind: 'cards', id: 'cd', items: [] },
      ],
    });
    expect(r.ok).toBe(true);
    const c = r.issues.map((i) => i.code);
    expect(c).toContain('empty-table');
    expect(c).toContain('empty-cards');
  });

  it('the extended content blocks carry no control (buildBlocks skips them)', () => {
    const controls = buildBlocks(
      [
        { kind: 'subheading', id: 'sh', text: 'Features' },
        { kind: 'media', id: 'm', src: 'x.png', text: 'hi' },
        { kind: 'cards', id: 'cd', items: [{ title: 'Wild' }] },
        { kind: 'table', id: 'tb', rows: [['a']] },
        { kind: 'legal', id: 'lg', text: 'fine print' },
        { kind: 'divider', id: 'dv' },
        { kind: 'toggle', id: 'mute' }, // the only control
      ],
      new EventBus<OpenUIEvents>(),
    );
    expect(controls.map((x) => x.id)).toEqual(['mute']);
  });
});
