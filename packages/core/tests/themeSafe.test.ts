import { describe, it, expect, vi } from 'vitest';
import { resolveTheme, sanitizeThemeOverrides, isSafeColor, themePresets } from '../src/theme/presets';

describe('safe theming — configure, never break', () => {
  it('accepts valid colours (hex + rgb) and rejects junk', () => {
    expect(isSafeColor('#fff')).toBe(true);
    expect(isSafeColor('#ffcc00')).toBe(true);
    expect(isSafeColor('#ffcc0080')).toBe(true);
    expect(isSafeColor('rgb(255, 0, 0)')).toBe(true);
    expect(isSafeColor('rgba(0,0,0,0.5)')).toBe(true);
    expect(isSafeColor('red')).toBe(false); // named colours not allowed (keep it strict)
    expect(isSafeColor('javascript:alert(1)')).toBe(false);
    expect(isSafeColor(42)).toBe(false);
    expect(isSafeColor(undefined)).toBe(false);
  });

  it('a bad accent colour falls back to the theme default and reports the issue', () => {
    const onIssue = vi.fn();
    const theme = resolveTheme({ preset: 'default', overrides: { color: { accent: 'not-a-color' } } }, onIssue);
    expect(theme.color.accent).toBe(themePresets.default.color.accent); // unchanged, not broken
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({ code: 'bad-color', path: 'theme.color.accent' }));
  });

  it('a valid override is applied; the rest of the preset is preserved', () => {
    const theme = resolveTheme({ preset: 'default', overrides: { color: { accent: '#abc123' } } });
    expect(theme.color.accent).toBe('#abc123');
    expect(theme.color.text).toBe(themePresets.default.color.text);
  });

  it('clamps radii and ignores a non-finite one', () => {
    const onIssue = vi.fn();
    const out = sanitizeThemeOverrides({ radius: { card: 9999, pill: NaN } }, onIssue);
    expect(out.radius?.card).toBe(999); // clamped
    expect(out.radius?.pill).toBeUndefined(); // dropped
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({ code: 'bad-radius' }));
  });

  it('takes a string font family, ignores a non-string one', () => {
    expect(sanitizeThemeOverrides({ type: { family: 'Inter, sans-serif' } }).type?.family).toBe('Inter, sans-serif');
    expect(sanitizeThemeOverrides({ type: { family: 123 as unknown as string } }).type).toBeUndefined();
  });

  it('a fully malformed override still yields a usable, frozen theme', () => {
    const theme = resolveTheme({ color: { accent: '##bad', surface: 'nope' } } as never);
    expect(theme.color.accent).toBe(themePresets.default.color.accent);
    expect(theme.color.surface).toBe(themePresets.default.color.surface);
    expect(Object.isFrozen(theme)).toBe(true);
  });
});
