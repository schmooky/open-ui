/**
 * The notice / error modal model.
 *
 * The HUD shows a menu-style modal built from declarative {@link BlockSpec} content
 * plus a row of action buttons. EVERY string — title, message, and each button
 * label — is passed through the translator (`ui.t`), so the host can either pass the
 * EXACT literal text they want, or a translation key they localize themselves (their
 * `locale.messages` dict overrides the built-in English defaults). Nothing is
 * hard-coded in the renderer, and every default is overridable per call.
 */
import type { BlockSpec } from './spec/types';

export interface NoticeAction {
  /** Button label — a literal string OR an i18n key (resolved via the translator). */
  label: string;
  /** Called when the button is pressed. */
  onSelect?: () => void;
  /** Also emit a `buttonActivated` event with this id (for analytics / host wiring). */
  emit?: string;
  /** Visual weight (default: first action `primary`, the rest `secondary`). */
  variant?: 'primary' | 'secondary';
  /** Keep the modal open after pressing (default: dismiss it). */
  keepOpen?: boolean;
}

export interface NoticeOptions {
  /** Title — literal or i18n key. Default `'openui.error'` for errors. */
  title?: string;
  /** Callout tone. Default `'warning'` for errors. */
  tone?: 'info' | 'warning' | 'bonus';
  /** Action buttons. Omitted → a single dismiss button (`openui.ok`), or NONE when
   *  `blocking` (so a fatal modal is dismissable only in code). */
  actions?: NoticeAction[];
  /** FATAL/blocking modal: locks the HUD, no backdrop/✕ dismiss; remove via `hideNotice`. */
  blocking?: boolean;
}

/** Reality-check reminder config (RTS 13). You supply the cadence + text; open-ui
 *  owns the (wall-clock) timer, the event, and the modal. */
export interface RealityCheckOptions {
  /** Reminder interval in minutes (wall-clock). */
  everyMinutes: number;
  /** Modal title — literal or i18n key. `{{minutes}}`/`{{spent}}`/`{{won}}` interpolate. */
  title?: string;
  /** Modal message — literal or i18n key. Same interpolation tokens. */
  message?: string;
  /** Show the built-in acknowledge modal (default true). `false` → only the event fires. */
  showModal?: boolean;
  /** Custom action buttons (default a single "Continue"). */
  actions?: NoticeAction[];
}

/** What `showRgsError` accepts: notice options plus an exact message override. */
export interface RgsErrorOptions extends NoticeOptions {
  /** Override the default message for this code with exact text (or your own key). */
  message?: string;
  /** Stop an in-progress autoplay session (default true — most RGS errors should). */
  stopAutoplay?: boolean;
}

/** RGS status codes open-ui ships a default message for (the TS enum + the HTTP groups). */
export type RgsErrorCode =
  | 'ERR_IPB'
  | 'ERR_IS'
  | 'ERR_ATE'
  | 'ERR_GLE'
  | 'ERR_BE'
  | 'ERR_BNF'
  | 'ERR_LOC'
  | 'ERR_MAINTENANCE'
  | 'ERR_VAL'
  | 'ERR_GEN'
  | 'ERR_UE'
  | 'ERR_TIMEOUT';

/**
 * Code → default title/message i18n KEYS. The English text for these keys lives in
 * the translator defaults (`openuiDefaults`), so a host localizes errors by adding
 * those keys to their `messages` dict — or overrides any single one per call via
 * `showRgsError(code, { title, message })`. Unknown codes fall back to generic.
 */
export const RGS_ERROR_KEYS: Readonly<Record<string, { title: string; message: string }>> = Object.freeze({
  ERR_IPB: { title: 'openui.err.insufficient.title', message: 'openui.err.insufficient.message' },
  ERR_IS: { title: 'openui.err.session.title', message: 'openui.err.session.message' },
  ERR_ATE: { title: 'openui.err.session.title', message: 'openui.err.session.message' },
  ERR_GLE: { title: 'openui.err.limit.title', message: 'openui.err.limit.message' },
  ERR_BE: { title: 'openui.err.activebet.title', message: 'openui.err.activebet.message' },
  ERR_BNF: { title: 'openui.err.generic.title', message: 'openui.err.generic.message' },
  ERR_LOC: { title: 'openui.err.location.title', message: 'openui.err.location.message' },
  ERR_MAINTENANCE: { title: 'openui.err.maintenance.title', message: 'openui.err.maintenance.message' },
  ERR_VAL: { title: 'openui.err.generic.title', message: 'openui.err.generic.message' },
  ERR_GEN: { title: 'openui.err.generic.title', message: 'openui.err.generic.message' },
  ERR_UE: { title: 'openui.err.generic.title', message: 'openui.err.generic.message' },
  ERR_TIMEOUT: { title: 'openui.err.connection.title', message: 'openui.err.connection.message' },
});

/** The default dismiss action used when a notice supplies none. */
export const DEFAULT_NOTICE_ACTION: NoticeAction = { label: 'openui.ok', variant: 'primary' };

/** Build the title + message blocks for an error/notice (used by `showError`).
 *  The Figma "default" modal is plain: a heading + body text (no tinted callout).
 *  `tone` is kept for API compatibility but no longer changes the rendering. */
export function errorBlocks(message: string, title: string, _tone: NonNullable<NoticeOptions['tone']>): BlockSpec[] {
  return [
    { kind: 'heading', id: 'notice-title', text: title },
    { kind: 'text', id: 'notice-body', text: message },
  ];
}
