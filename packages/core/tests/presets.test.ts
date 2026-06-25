import { describe, it, expect } from 'vitest';
import { resolveTheme, themePresets } from '../src/theme/presets';
import { defaultTheme } from '../src/theme/tokens';

describe('theme presets + resolveTheme (Charter P8)', () => {
  it('ships a frozen preset map', () => {
    expect(themePresets.default).toBe(defaultTheme);
    expect(themePresets.midnight.color.accent).toBe('#6ea8fe');
    expect(themePresets.neon.color.accent).toBe('#ff2d95');
    expect(Object.isFrozen(themePresets)).toBe(true);
  });

  it('resolves undefined to the default theme', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });

  it('resolves a preset name', () => {
    expect(resolveTheme('midnight').color.accent).toBe('#6ea8fe');
  });

  it('layers overrides on a chosen preset', () => {
    const t = resolveTheme({ preset: 'neon', overrides: { color: { accent: '#ffffff' } } });
    expect(t.color.accent).toBe('#ffffff');
    expect(t.color.text).toBe('#f0e9ff'); // neon's other tokens preserved
  });

  it('treats a bare partial as an override on the default (un-themed-safe)', () => {
    const t = resolveTheme({ color: { accent: '#E8B23A' } });
    expect(t.color.accent).toBe('#E8B23A');
    expect(t.color.surface).toBe(defaultTheme.color.surface); // fallback preserved
  });
});
