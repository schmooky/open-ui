/**
 * Theming = data. Semantic tokens with safe fallbacks (Charter P8).
 * A game theme is a small override map; nothing renders un-themed because
 * the renderer always has these defaults to fall back on.
 */

export interface Theme {
  color: {
    accent: string;
    accentText: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textDim: string;
    disabled: string;
  };
  radius: { pill: number; card: number };
  space: { sm: number; md: number; lg: number };
  type: { family: string; size: { sm: number; md: number; lg: number } };
  /** Motion durations in ms. */
  motion: { fast: number; base: number; slow: number };
}

/** Neutral reference theme. The real game theme is built on top of this. */
export const defaultTheme: Theme = {
  color: {
    accent: '#ffc935',
    accentText: '#1a1a1a',
    surface: '#161b22',
    surfaceAlt: '#0b0e13',
    text: '#ffffff',
    textDim: '#7a8290',
    disabled: '#3a3f47',
  },
  radius: { pill: 999, card: 16 },
  space: { sm: 8, md: 16, lg: 24 },
  type: { family: 'system-ui, sans-serif', size: { sm: 14, md: 18, lg: 28 } },
  motion: { fast: 120, base: 200, slow: 360 },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const pv = (patch as Record<string, unknown>)[key];
    const bv = (base as Record<string, unknown>)[key];
    out[key] = isObject(pv) && isObject(bv) ? merge(bv, pv as DeepPartial<typeof bv>) : pv;
  }
  return out as T;
}

/** Produce a new theme from the default (or any base) plus an override patch. */
export function extendTheme(base: Theme, patch: DeepPartial<Theme>): Theme {
  return merge(base, patch);
}
