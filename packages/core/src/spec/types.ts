/**
 * The JSON-serializable UISpec — the single source of truth that builds the
 * control tree, drives e2e, and powers the docs panel editor (the "SpecKit"
 * design). Authoring it is type-checked; `validateSpec` guards it at runtime;
 * `createUI` assembles it over the existing OpenUI machinery.
 */
import type { LayoutSpec } from '../layout/anchor';
import type { LayoutConfig, Breakpoint, Orientation } from '../layout/screen';
import type { ThemeChoice } from '../theme/presets';
import type { CurrencySpec } from '../controls/ValueDisplay';
import type { SelectOption } from '../controls/SelectControl';
import type { AutoplayMode } from '../controls/AutoplayControl';
import type { PanelVariant, PanelControl } from '../controls/PanelControl';
import type { Control } from '../control/Control';
import type { OpenUIEvents } from '../types';
import type { MenuSpec } from './menu';
import type { JurisdictionConfig } from './jurisdiction';

/** The reference-HUD control ids — typed so a typo is a compile error. */
export type KnownControlId =
  | 'spin'
  | 'balance'
  | 'bet'
  | 'settings'
  | 'settings-panel'
  | 'music'
  | 'sfx'
  | 'rules'
  | 'info-panel'
  | 'info-close'
  | 'turbo'
  | 'autoplay'
  | 'bonus'
  | 'bet-stepper'
  | 'bet-plus'
  | 'bet-minus'
  | 'fullscreen'
  | 'mute'
  | 'rtp'
  | 'net-position'
  | 'session-timer'
  | 'notice-panel';

/** One issue from the never-throw validator. */
export interface SpecIssue {
  level: 'error' | 'warn';
  path: string;
  code: string;
  message: string;
}

/** Host-owned side effects, injected (the lib performs none itself — Charter B8). */
export interface HostHooks {
  onDataIssue?(issue: SpecIssue): void;
  onAnalyticsEvent?: <K extends keyof OpenUIEvents>(type: K, payload: OpenUIEvents[K]) => void;
}

/** A targeted override for one shipped control. Anything omitted keeps the default. */
export interface ControlOverride {
  layout?: LayoutSpec;
  label?: string;
  hidden?: boolean;
  disabled?: boolean;
  currency?: CurrencySpec;
  initial?: number;
}

/**
 * Turbo switcher config. Choose how many modes the one Turbo control cycles
 * through — `2` (off/on) or `3` (off/turbo/super) — or pass explicit mode names.
 */
export interface TurboSpec {
  /** `2` → off/on · `3` → off/turbo/super · or a custom ordered ladder (first = off). */
  modes?: 2 | 3 | string[];
  /** Initial mode index (0 = off). */
  index?: number;
}

/** How pressing the spin button behaves. */
export type SpinPress = 'tap' | 'hold-to-spin';

export interface SpinSpec {
  /** `'tap'` = one spin per tap · `'hold-to-spin'` = turbo-spin while held. Default `'tap'`. */
  press?: SpinPress;
}

/** A responsive bucket the config can target: a device size OR an orientation. */
export type ResponsiveKey = Breakpoint | Orientation;

/** What a responsive bucket may change. Layout + visibility, per control. */
export interface ResponsiveOverride {
  controls?: Record<string, Pick<ControlOverride, 'layout' | 'hidden'>>;
}

/**
 * A declarative menu/panel content block. Discriminated by `kind` so a "shown but
 * no payload" bug is uncompilable (Charter B10): a `select` cannot omit options,
 * a `slider` cannot carry them.
 */
export type BlockSpec =
  | { kind: 'slider'; id: string; label?: string; initial?: number }
  | { kind: 'toggle'; id: string; label?: string; on?: boolean }
  | { kind: 'button'; id: string; label: string; action?: 'closePanel' | 'openPanel' | 'emit'; target?: string; role?: string }
  | { kind: 'select'; id: string; label?: string; options: SelectOption[]; index?: number }
  | { kind: 'stepper'; id: string; label?: string; levels: number[]; index?: number }
  | { kind: 'value'; id: string; label?: string; currency?: CurrencySpec; initial?: number }
  | { kind: 'text'; id: string; text: string }
  // ── static "rules"/info content (no control; every text run through `ui.t`) ──
  | { kind: 'heading'; id: string; text: string }
  | { kind: 'subheading'; id: string; text: string }
  | { kind: 'callout'; id: string; tone?: 'info' | 'bonus' | 'warning'; title?: string; text: string }
  | { kind: 'stat-grid'; id: string; items: Array<{ label: string; value: string }> }
  | { kind: 'steps'; id: string; ordered?: boolean; items: string[] }
  | { kind: 'table'; id: string; columns?: string[]; rows: string[][] }
  | { kind: 'paytable'; id: string; columns?: number; rows: Array<{ symbol?: string; payouts: string; icon?: string }> }
  | { kind: 'image'; id: string; src: string; alt?: string; width?: number; height?: number }
  | { kind: 'media'; id: string; src: string; alt?: string; side?: 'left' | 'right'; title?: string; text: string; width?: number; height?: number }
  | { kind: 'cards'; id: string; items: Array<{ icon?: string; title: string; text?: string }> }
  | { kind: 'legal'; id: string; text: string }
  | { kind: 'divider'; id: string }
  | { kind: 'group'; id: string; title?: string; children: BlockSpec[] };

/** All block kinds, for runtime validation of untyped host data. */
export const BLOCK_KINDS = [
  'slider',
  'toggle',
  'button',
  'select',
  'stepper',
  'value',
  'text',
  'heading',
  'subheading',
  'callout',
  'stat-grid',
  'steps',
  'table',
  'paytable',
  'image',
  'media',
  'cards',
  'legal',
  'divider',
  'group',
] as const;

export interface PanelSpec {
  id: string;
  variant: PanelVariant;
  title?: string;
  layout?: LayoutSpec;
  blocks: BlockSpec[];
}

/** The whole UI as one optional, JSON-serializable object. Omit any field → default. */
export interface UISpec {
  meta?: { id: string; version: number };
  theme?: ThemeChoice;
  layout?: LayoutConfig;
  /** Sets both balance + bet currency at once. */
  currency?: CurrencySpec;
  betLadder?: { levels: number[]; index?: number };
  /**
   * Autoplay count choices + tap behavior (`'options'` drawer or `'infinite'`), plus
   * optional responsible-gambling limit choices (multiples of bet; Infinity = none).
   * When `lossLimits`/`winLimits` are set, the picker offers them and the host must
   * feed each round to `hud.reportRound(win, bet)` so they're enforced.
   */
  autoplay?: { options?: number[]; mode?: AutoplayMode; lossLimits?: number[]; winLimits?: number[] };
  /** Turbo switcher: 2-mode (off/on) or 3-mode (off/turbo/super). */
  turbo?: TurboSpec;
  /** Spin button behavior: single `'tap'` or `'hold-to-spin'` turbo. */
  spin?: SpinSpec;
  /**
   * Per-device / per-orientation overrides, layered on top of `controls`. Keys are
   * `'mobile' | 'tablet' | 'desktop'` (device size) and `'portrait' | 'landscape'`
   * (orientation); on each resize the matching buckets re-apply, so the HUD can
   * reflow or drop controls per screen. Order: base → orientation → size.
   */
  responsive?: Partial<Record<ResponsiveKey, ResponsiveOverride>>;
  controls?: Partial<Record<KnownControlId, ControlOverride>> & Record<string, ControlOverride>;
  /** The unified scrollable MENU opened by ☰: Settings → Paytable → Rules. */
  menu?: MenuSpec;
  /** Back-compat: rules blocks, folded into the menu's Rules section if `menu.rules` is absent. */
  rules?: BlockSpec[];
  /** Additional declarative panels. */
  panels?: PanelSpec[];
  /** i18n dictionary + starting locale (built into a DictionaryTranslator). */
  locale?: { messages: Record<string, Record<string, string>>; locale: string };
  /** Block/control id whose `optionSelected` switches the locale. Default 'lang'. */
  localeSelectId?: string;
  /** Auto-lock the whole HUD while the spin control is spinning. Default true. */
  lockDuringSpin?: boolean;
  /**
   * Stake Engine per-player jurisdiction config — the compliance switchboard. Usually
   * known only after the game authenticates, so prefer the runtime
   * `hud.applyJurisdiction(jur)`; set it here when known up front (createUI applies it
   * before the responsive layer so `disabled*` hides survive resizes).
   */
  jurisdiction?: JurisdictionConfig;
  /** Initial RTP percentage for the RTP readout (e.g. 96 → "96.0%"). */
  rtp?: number;
  /** Put the compliance readouts (net · RTP · session) in a thin status bar pinned
   *  to the `'top'` or `'bottom'` edge instead of at screen corners. */
  statusBar?: 'top' | 'bottom';
}

/** The result of building a PanelSpec: the panel + every leaf control, in render order. */
export interface BuiltPanel {
  panel: PanelControl;
  controls: Control[];
  blocks: BlockSpec[];
}
