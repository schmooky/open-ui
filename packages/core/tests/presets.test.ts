import { describe, it, expect } from 'vitest';
import { resolveTheme, themePresets } from '../src/theme/presets';
import { defaultTheme } from '../src/theme/tokens';

describe('theme presets + resolveTheme (Charter P8)', () => {
  it('ships ONE frozen preset — the b&w + yellow default', () => {
    expect(themePresets.default).toBe(defaultTheme);
    expect(themePresets.default.color.accent).toBe('#ffc935'); // yellow accent
    expect(Object.isFrozen(themePresets)).toBe(true);
  });

  it('resolves undefined to the default theme', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });

  it('resolves the default preset name, and an unknown name falls back to default', () => {
    expect(resolveTheme('default').color.accent).toBe('#ffc935');
    expect(resolveTheme('midnight' as never)).toBe(defaultTheme); // removed preset → default
  });

  it('layers overrides on the chosen preset', () => {
    const t = resolveTheme({ preset: 'default', overrides: { color: { accent: '#ffffff' } } });
    expect(t.color.accent).toBe('#ffffff');
    expect(t.color.text).toBe(defaultTheme.color.text); // the preset's other tokens preserved
  });

  it('treats a bare partial as an override on the default (un-themed-safe)', () => {
    const t = resolveTheme({ color: { accent: '#E8B23A' } });
    expect(t.color.accent).toBe('#E8B23A');
    expect(t.color.surface).toBe(defaultTheme.color.surface); // fallback preserved
  });
});
