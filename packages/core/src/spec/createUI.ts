/**
 * createUI(spec) — assemble a complete, configured OpenUI from one JSON UISpec,
 * over the EXISTING reference HUD (Charter P1/P4/B9). Zero-arg `createUI()`
 * reproduces today's 16-control HUD. Pure assembly: validate → apply overrides →
 * wire the ref-counted spin lock → freeze the spec onto `ui.spec`.
 */
import { OpenUI } from '../OpenUI';
import { ValueDisplay } from '../controls/ValueDisplay';
import { resolveTheme } from '../theme/presets';
import { DictionaryTranslator } from '../i18n/translator';
import { validateSpec } from './validateSpec';
import { installResponsive } from './responsive';
import { applyJurisdiction } from './jurisdiction';
import { resolveCurrency } from '../format/currency';
import type { UISpec, HostHooks, TurboSpec } from './types';
import type { OpenUIEvents } from '../types';

/** Resolve the turbo `modes` config (`2`/`3` presets or explicit names) to a ladder. */
export function resolveTurboModes(modes: TurboSpec['modes']): string[] {
  if (Array.isArray(modes)) return modes.length ? modes : ['off', 'on'];
  if (modes === 3) return ['off', 'turbo', 'super'];
  return ['off', 'on'];
}

/** Identity helper for typed authoring (IDE checks the shape); returns the spec. */
export function defineUI(spec: UISpec): UISpec {
  return spec;
}

const ANALYTICS_EVENTS = [
  'stateChanged',
  'buttonActivated',
  'valueChanged',
  'toggled',
  'optionSelected',
  'panelToggled',
  'autoplayStarted',
  'autoplayStopped',
] as const;

export function createUI(spec: UISpec = {}, hooks: HostHooks = {}): OpenUI {
  // Never-reject: report issues to the host, but still boot.
  const { issues } = validateSpec(spec);
  for (const issue of issues) hooks.onDataIssue?.(issue);

  const translator = spec.locale
    ? new DictionaryTranslator(spec.locale.messages, spec.locale.locale)
    : undefined;
  // Theme overrides are sanitized; any rejected value is reported, never fatal.
  const theme = resolveTheme(spec.theme, (i) => hooks.onDataIssue?.(i));
  const ui = new OpenUI({ theme, layout: spec.layout, translator });

  if (spec.currency) {
    const cur = typeof spec.currency === 'string' ? resolveCurrency(spec.currency) : spec.currency;
    ui.balance.setCurrency(cur);
    ui.bet.setCurrency(cur);
    ui.netPosition.setCurrency(cur);
  }

  if (typeof spec.rtp === 'number') ui.rtp.set(spec.rtp);
  if (spec.game) ui.gameInfo = { name: spec.game.name, version: spec.game.version };

  if (spec.betLadder?.levels?.length) {
    ui.betStepper.setLevels(spec.betLadder.levels, spec.betLadder.index ?? 0);
    ui.bet.set(ui.betStepper.value);
  }

  if (spec.autoplay?.options?.length) {
    ui.autoplay.setOptions(spec.autoplay.options);
  }
  if (spec.autoplay?.mode) {
    ui.autoplay.mode = spec.autoplay.mode;
  }
  if (spec.autoplay?.lossLimits) ui.autoplay.setLossLimitOptions(spec.autoplay.lossLimits);
  if (spec.autoplay?.winLimits) ui.autoplay.setWinLimitOptions(spec.autoplay.winLimits);

  // Turbo: 2-mode (off/on) or 3-mode (off/turbo/super), or an explicit ladder.
  if (spec.turbo) {
    ui.turbo.setModes(resolveTurboModes(spec.turbo.modes));
    if (spec.turbo.index != null) ui.turbo.setIndex(spec.turbo.index);
  }

  // Spin: single tap vs press-and-hold turbo.
  if (spec.spin?.press) {
    ui.spin.holdToSpin = spec.spin.press === 'hold-to-spin';
  }

  if (spec.controls) {
    for (const [id, ov] of Object.entries(spec.controls)) {
      const c = ui.control(id);
      if (!c) continue;
      if (ov.layout) c.layout = ov.layout;
      if (ov.hidden) ui.hidden.add(id);
      const disable = (c as { disable?: () => void }).disable;
      if (ov.disabled && typeof disable === 'function') disable.call(c);
      if (c instanceof ValueDisplay) {
        if (ov.currency) c.setCurrency(ov.currency);
        if (ov.initial != null) c.set(ov.initial);
        if (ov.digits != null) c.setDigits(ov.digits);
      }
    }
  }

  // Jurisdiction (the Stake Engine compliance switchboard) is applied BEFORE the
  // responsive layer snapshots its base, so a `disabled*` hide is part of that base
  // and survives every resize (it's force-hidden too, belt-and-braces).
  if (spec.jurisdiction) applyJurisdiction(ui, spec.jurisdiction);

  // Responsive overrides layer on top of the static `controls` (snapshotted as the
  // base), re-applied on every resize. Installed here — before the renderer mounts
  // — so it runs first on each screen change and the views read fresh layouts.
  if (spec.responsive) {
    installResponsive(ui, spec.responsive);
  }

  // Ref-counted whole-HUD lock for the duration of a spin (Charter P6/G7). The
  // host drives spin state via `ui.spin.busy()`; this just brackets it.
  if (spec.lockDuringSpin !== false) {
    let wasSpinning = false;
    ui.spin.state.subscribe((s) => {
      const now = s === 'spinning';
      if (now && !wasSpinning) ui.lock();
      else if (!now && wasSpinning) ui.unlock();
      wasSpinning = now;
    });
  }

  // A select control with this id switches the whole UI locale; the host still
  // owns any persistence via HostHooks (Charter B8) — the lib only re-renders.
  const localeSelectId = spec.localeSelectId ?? 'lang';
  ui.on('optionSelected', ({ id, value }) => {
    if (id === localeSelectId) ui.setLocale(value);
  });

  if (hooks.onAnalyticsEvent) {
    const forward = hooks.onAnalyticsEvent;
    for (const type of ANALYTICS_EVENTS) {
      ui.on(type, (payload) => forward(type, payload as OpenUIEvents[typeof type]));
    }
  }

  ui.spec = Object.freeze(spec);
  return ui;
}
