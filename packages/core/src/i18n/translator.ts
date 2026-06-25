import type { Dispose } from '../signal';

/**
 * i18n port (Charter B5/B8): the core depends on this tiny interface, NOT on i18next.
 * Ship adapters (`@open-ui/i18n-i18next`, the built-in `dictionary()`), never a hard dep.
 */
export interface Translator {
  t(key: string, vars?: Record<string, string | number>): string;
  readonly locale: string;
  /** Switch the active locale (a no-op for the same locale); fires onChange. */
  setLocale(next: string): void;
  onChange(cb: (locale: string) => void): Dispose;
}

/** open-ui owns this namespace; the host's translator may override any key. */
export const openuiDefaults: Record<string, string> = {
  'openui.spin': 'Spin',
  'openui.stop': 'Stop',
  'openui.autoplay': 'Autoplay',
  'openui.bet': 'Bet',
  'openui.balance': 'Balance',
  'openui.win': 'Win',
  'openui.menu': 'Menu',
  'openui.rules': 'Rules',
  'openui.paytable': 'Paytable',
  'openui.settings': 'Settings',
  'openui.close': 'Close',
  'openui.language': 'Language',
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars[k] ?? `{{${k}}}`));
}

/**
 * Zero-dep dictionary translator. Falls back to open-ui defaults, then to the
 * key itself only if nothing is found — but built-in keys always resolve, so the
 * library never renders a raw key (the text analog of "never break un-themed").
 */
export class DictionaryTranslator implements Translator {
  private _locale: string;
  private readonly subs = new Set<(locale: string) => void>();

  constructor(private readonly messages: Record<string, Record<string, string>>, locale: string) {
    this._locale = locale;
  }

  get locale(): string {
    return this._locale;
  }

  setLocale(next: string): void {
    if (next === this._locale) return;
    this._locale = next;
    for (const cb of [...this.subs]) cb(next);
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const resolved = this.messages[this._locale]?.[key] ?? openuiDefaults[key] ?? key;
    return interpolate(resolved, vars);
  }

  onChange(cb: (locale: string) => void): Dispose {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
}

/** Convenience factory for a zero-dep dictionary translator. */
export function dictionary(
  messages: Record<string, Record<string, string>>,
  locale: string,
): DictionaryTranslator {
  return new DictionaryTranslator(messages, locale);
}
