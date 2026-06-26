import { defaultTheme, extendTheme, type Theme, type DeepPartial } from './tokens';

/** Built-in presets. open-ui ships a SINGLE canonical look — black & white with a
 *  yellow accent (the `default` token theme). Hosts restyle via `ThemeOverrides`
 *  (sanitized colours/radius/font), so the library stays themeable without shipping
 *  a palette zoo. Unknown preset names resolve to `default`. */
export type ThemePreset = 'default';

/**
 * The SAFE, curated surface a host may override (Charter P8 + "configure, don't
 * break"). Deliberately a subset of the full `Theme`: colours, corner radii, and
 * the font family — the look knobs. Structural tokens (spacing, motion timing,
 * font sizes) are NOT exposed, so a theme can restyle the HUD but cannot break its
 * layout or timing. Every value is validated/clamped at runtime too (see below).
 */
export interface ThemeOverrides {
  color?: Partial<Theme['color']>;
  radius?: Partial<Theme['radius']>;
  type?: { family?: string };
}

/** A reportable theme problem (structurally a `SpecIssue`, kept dependency-free). */
export interface ThemeIssue {
  level: 'warn' | 'error';
  path: string;
  code: string;
  message: string;
}

/**
 * What a host can pass for `theme`: a preset name, a safe override (layered on the
 * default), or `{ preset, overrides }` to layer a safe override on a chosen preset.
 */
export type ThemeChoice =
  | ThemePreset
  | ThemeOverrides
  | { preset?: ThemePreset; overrides?: ThemeOverrides };

/** The one ready-to-use theme: black & white with a yellow accent (`defaultTheme`). */
export const themePresets: Readonly<Record<ThemePreset, Theme>> = Object.freeze({
  default: defaultTheme,
}) as Readonly<Record<ThemePreset, Theme>>;

// A pragmatic CSS-colour check: hex (#rgb/#rgba/#rrggbb/#rrggbbaa) or rgb()/rgba().
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*[0-9.\s,%/]+\)$/i;

/** True for a colour string the renderer can safely use. */
export function isSafeColor(v: unknown): v is string {
  return typeof v === 'string' && (HEX.test(v.trim()) || RGB.test(v.trim()));
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Turn host overrides into a guaranteed-safe `DeepPartial<Theme>`: invalid colours
 * are dropped (the base token shows through), radii are clamped to a sane range,
 * and a non-string font family is ignored. Each rejection is reported, never fatal.
 */
export function sanitizeThemeOverrides(ov: ThemeOverrides, onIssue?: (i: ThemeIssue) => void): DeepPartial<Theme> {
  const out: DeepPartial<Theme> = {};
  if (ov.color) {
    const color: Partial<Theme['color']> = {};
    for (const [k, v] of Object.entries(ov.color)) {
      if (isSafeColor(v)) color[k as keyof Theme['color']] = v.trim();
      else onIssue?.({ level: 'warn', path: `theme.color.${k}`, code: 'bad-color', message: `"${String(v)}" is not a valid colour — kept the theme default` });
    }
    if (Object.keys(color).length) out.color = color;
  }
  if (ov.radius) {
    const radius: Partial<Theme['radius']> = {};
    for (const [k, v] of Object.entries(ov.radius)) {
      if (typeof v === 'number' && Number.isFinite(v)) radius[k as keyof Theme['radius']] = clamp(v, 0, 999);
      else onIssue?.({ level: 'warn', path: `theme.radius.${k}`, code: 'bad-radius', message: `radius "${String(v)}" must be a finite number — ignored` });
    }
    if (Object.keys(radius).length) out.radius = radius;
  }
  if (ov.type?.family != null) {
    if (typeof ov.type.family === 'string' && ov.type.family.trim()) out.type = { family: ov.type.family };
    else onIssue?.({ level: 'warn', path: 'theme.type.family', code: 'bad-family', message: 'font family must be a non-empty string — ignored' });
  }
  return out;
}

function isPresetChoice(c: ThemeChoice): c is { preset?: ThemePreset; overrides?: ThemeOverrides } {
  return typeof c === 'object' && c !== null && ('preset' in c || 'overrides' in c);
}

/**
 * Resolve any `ThemeChoice` into a concrete, frozen Theme. Overrides are
 * sanitized first, so a host can restyle the HUD but never break it: bad values
 * fall back to the safe token (Charter P8/G5/P11). Pass `onIssue` to surface
 * rejections (createUI forwards these to `HostHooks.onDataIssue`).
 */
export function resolveTheme(choice?: ThemeChoice, onIssue?: (i: ThemeIssue) => void): Theme {
  if (!choice) return defaultTheme;
  if (typeof choice === 'string') return themePresets[choice] ?? defaultTheme;
  if (isPresetChoice(choice)) {
    const base = choice.preset ? themePresets[choice.preset] ?? defaultTheme : defaultTheme;
    if (!choice.overrides) return base;
    return Object.freeze(extendTheme(base, sanitizeThemeOverrides(choice.overrides, onIssue)));
  }
  return Object.freeze(extendTheme(defaultTheme, sanitizeThemeOverrides(choice as ThemeOverrides, onIssue)));
}
