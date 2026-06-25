import { describe, it, expect, vi } from 'vitest';
import { OpenUI } from '../src/OpenUI';
import { createUI } from '../src/spec/createUI';
import { dictionary } from '../src/i18n/translator';

describe('i18n + language switching (Charter B5/B8)', () => {
  it('OpenUI.t passes unknown keys through and resolves via the translator', () => {
    const ui = new OpenUI({ translator: dictionary({ de: { Balance: 'Guthaben' } }, 'en') });
    expect(ui.t('Balance')).toBe('Balance'); // en has no entry → fall through to the key
    ui.setLocale('de');
    expect(ui.locale.get()).toBe('de');
    expect(ui.t('Balance')).toBe('Guthaben');
  });

  it('setLocale emits localeChanged once and is a no-op for the same locale', () => {
    const ui = new OpenUI({ translator: dictionary({ de: {} }, 'en') });
    const seen = vi.fn();
    ui.on('localeChanged', seen);
    ui.setLocale('de');
    ui.setLocale('de'); // no-op
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenLastCalledWith('de');
  });

  it('built-in openui.* keys always resolve (never renders a raw key)', () => {
    const ui = new OpenUI();
    expect(ui.t('openui.rules')).toBe('Rules');
    expect(ui.t('openui.language')).toBe('Language');
  });

  it('createUI builds a translator from spec.locale and wires the language select', () => {
    const ui = createUI({
      locale: { locale: 'en', messages: { de: { Balance: 'Guthaben', Bet: 'Einsatz' } } },
      menu: [{ kind: 'select', id: 'lang', options: [{ value: 'en', label: 'EN' }, { value: 'de', label: 'DE' }] }],
    });
    expect(ui.t('Balance')).toBe('Balance');
    // choosing 'de' on the language select switches the entire UI locale
    ui.bus.emit('optionSelected', { id: 'lang', value: 'de', index: 1 });
    expect(ui.locale.get()).toBe('de');
    expect(ui.t('Balance')).toBe('Guthaben');
    expect(ui.t('Bet')).toBe('Einsatz');
  });

  it('respects a custom localeSelectId', () => {
    const ui = createUI({
      localeSelectId: 'language',
      locale: { locale: 'en', messages: { fr: { Balance: 'Solde' } } },
    });
    ui.bus.emit('optionSelected', { id: 'lang', value: 'fr', index: 0 }); // wrong id → ignored
    expect(ui.locale.get()).toBe('en');
    ui.bus.emit('optionSelected', { id: 'language', value: 'fr', index: 0 });
    expect(ui.locale.get()).toBe('fr');
  });
});
