import { describe, it, expect } from 'vitest';
import { composeMenu } from '../src/spec/menu';

const kinds = (bs: ReturnType<typeof composeMenu>): string[] => bs.map((b) => b.kind);
const ids = (bs: ReturnType<typeof composeMenu>): string[] => bs.map((b) => b.id);

describe('composeMenu — Settings → Paytable → Rules', () => {
  it('a bare menu is just Settings: heading + Music + Sound', () => {
    const bs = composeMenu(undefined);
    expect(kinds(bs)).toEqual(['heading', 'slider', 'slider']);
    expect(ids(bs)).toEqual(['menu-sec-settings', 'music', 'sfx']);
  });

  it('adds a Language select when 2+ locales are configured', () => {
    const bs = composeMenu(undefined, { locales: ['en', 'de', 'fr'], localeSelectId: 'lang' });
    const lang = bs.find((b) => b.id === 'lang');
    expect(lang?.kind).toBe('select');
    expect(lang && 'options' in lang ? lang.options.map((o) => o.value) : []).toEqual(['en', 'de', 'fr']);
    // native labels resolved
    expect(lang && 'options' in lang ? lang.options[1]?.label : '').toBe('Deutsch');
  });

  it('omits the Language select for a single locale', () => {
    expect(composeMenu(undefined, { locales: ['en'] }).some((b) => b.id === 'lang')).toBe(false);
  });

  it('appends extra settings, then Paytable, then Rules — in order', () => {
    const bs = composeMenu({
      settings: [{ kind: 'toggle', id: 'shake', label: 'Screen shake' }],
      paytable: [{ kind: 'paytable', id: 'pt', rows: [{ symbol: 'W', payouts: '50x' }] }],
      rules: [{ kind: 'text', id: 'r1', text: 'Win on lines.' }],
    });
    expect(ids(bs)).toEqual([
      'menu-sec-settings', 'music', 'sfx', 'shake',
      'menu-sec-paytable', 'pt',
      'menu-sec-rules', 'r1',
    ]);
  });

  it('falls back to top-level rules when menu.rules is absent', () => {
    const bs = composeMenu({}, { rulesFallback: [{ kind: 'text', id: 'r', text: 'hi' }] });
    expect(ids(bs)).toContain('menu-sec-rules');
    expect(ids(bs)).toContain('r');
  });

  it('respects custom section titles', () => {
    const bs = composeMenu({ paytable: [{ kind: 'text', id: 'p', text: 'x' }], titles: { paytable: 'Payouts' } });
    const h = bs.find((b) => b.id === 'menu-sec-paytable');
    expect(h && 'text' in h ? h.text : '').toBe('Payouts');
  });
});
