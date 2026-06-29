import type { Dispose } from '../signal';

/**
 * i18n port (Charter B5/B8): the core depends on this tiny interface, NOT on i18next.
 * Ship adapters (`@open-slot-ui/i18n-i18next`, the built-in `dictionary()`), never a hard dep.
 */
export interface Translator {
  t(key: string, vars?: Record<string, string | number>): string;
  readonly locale: string;
  /** Switch the active locale (a no-op for the same locale); fires onChange. */
  setLocale(next: string): void;
  onChange(cb: (locale: string) => void): Dispose;
  /** Switch social/sweepstakes wording on/off. In social mode `t` resolves from a
   *  SEPARATE social dictionary first, so social copy can never be mixed into the
   *  normal keys by accident (by design). No-op if unsupported. */
  setSocial?(on: boolean): void;
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
  // compliance readouts + autoplay limit headings
  'openui.rtp': 'RTP',
  'openui.net': 'Net',
  'openui.session': 'Session',
  'openui.lossLimit': 'Stop on loss',
  'openui.winLimit': 'Stop on single win',
  // notice / error modal
  'openui.ok': 'OK',
  'openui.cancel': 'Cancel',
  'openui.confirm': 'Confirm',
  'openui.continue': 'Continue',
  'openui.reload': 'Reload',
  'openui.error': 'Error',
  'openui.notice': 'Notice',
  'openui.replay': 'Replay',
  'openui.buyFeature.title': 'Buy feature',
  'openui.buyFeature.message': 'Buy this feature now?',
  'openui.freeSpins': 'FS',
  // reality check (RTS 13) — {{minutes}} is interpolated by open-ui's scheduler
  'openui.realityCheck.title': 'Reality check',
  'openui.realityCheck.message': "You've been playing for {{minutes}} minutes. Take a moment before continuing.",
  // RGS error defaults (override via your messages dict or per-call)
  'openui.err.generic.title': 'Something went wrong',
  'openui.err.generic.message': 'Sorry, something went wrong. Please try again.',
  'openui.err.insufficient.title': 'Insufficient funds',
  'openui.err.insufficient.message': "You don't have enough balance to place this bet.",
  'openui.err.session.title': 'Session expired',
  'openui.err.session.message': 'Your session has expired. Reload the game to continue.',
  'openui.err.limit.title': 'Limit reached',
  'openui.err.limit.message': 'A gambling limit has been reached. Please try again later.',
  'openui.err.activebet.title': 'Round in progress',
  'openui.err.activebet.message': 'You already have a round in progress. Reload to finish it.',
  'openui.err.location.title': 'Unavailable here',
  'openui.err.location.message': 'This game is not available in your location.',
  'openui.err.maintenance.title': 'Under maintenance',
  'openui.err.maintenance.message': 'The game is briefly down for maintenance. Please try again soon.',
  'openui.err.connection.title': 'Connection lost',
  'openui.err.connection.message': 'A stable connection is required. Reload to finish any open round.',
};

/**
 * Social / sweepstakes wording — a SEPARATE dictionary (same keys as the normal
 * ones). Kept apart on purpose so a host can never mix gambling and social copy in
 * one map: provide your social overrides under `locale.socialMessages`, not inline.
 */
export const openuiSocialDefaults: Record<string, string> = {
  'openui.bet': 'Play',
  'openui.balance': 'Credits',
  'openui.win': 'Prize',
  'openui.buyFeature.title': 'Play bonus',
  'openui.buyFeature.message': 'Play this bonus now?',
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
  private _social = false;
  private readonly subs = new Set<(locale: string) => void>();

  constructor(
    private readonly messages: Record<string, Record<string, string>>,
    locale: string,
    /** SEPARATE social/sweepstakes dictionary — consulted first in social mode. */
    private readonly socialMessages: Record<string, Record<string, string>> = {},
  ) {
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

  setSocial(on: boolean): void {
    this._social = on;
  }

  t(key: string, vars?: Record<string, string | number>): string {
    // Social mode resolves from the dedicated social dictionary FIRST (host social
    // overrides → built-in social defaults), then falls back to the normal chain —
    // so social and gambling copy are kept structurally separate.
    const social = this._social
      ? this.socialMessages[this._locale]?.[key] ?? openuiSocialDefaults[key]
      : undefined;
    const resolved = social ?? this.messages[this._locale]?.[key] ?? openuiDefaults[key] ?? key;
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
  socialMessages?: Record<string, Record<string, string>>,
): DictionaryTranslator {
  return new DictionaryTranslator(messages, locale, socialMessages);
}
