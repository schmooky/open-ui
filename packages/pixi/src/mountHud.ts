import { type Application } from 'pixi.js';
import {
  createUI,
  buildPanel,
  composeMenu,
  type OpenUI,
  type UISpec,
  type HostHooks,
  type CurrencySpec,
  type EventLog,
  type ControlSnapshot,
  type Signal,
  type OpenUIEvents,
  type Dispose,
  type JurisdictionConfig,
  type BlockSpec,
  type NoticeAction,
  type NoticeOptions,
  type RgsErrorOptions,
} from '@open-ui/core';
import { OpenUIPixi, type OpenUIPixiOptions } from './OpenUIPixi';
import { PanelBodyView } from './views/PanelBodyView';

export interface HudOptions extends OpenUIPixiOptions {
  hooks?: HostHooks;
}

/**
 * The complete-HUD handle returned by `mountHud`. Wraps the headless OpenUI + the
 * Pixi controller with the day-to-day game verbs, so the host rarely touches the
 * lower layers. `dispose()` is the single, leak-free teardown (Charter P12).
 */
export interface BootedHud {
  readonly ui: OpenUI;
  readonly pixi: OpenUIPixi;
  on<K extends keyof OpenUIEvents>(type: K, fn: (p: OpenUIEvents[K]) => void): Dispose;
  setBalance(major: number): void;
  setBet(major: number): void;
  setCurrency(spec: CurrencySpec): void;
  /** Apply a Stake Engine jurisdiction config (the compliance switchboard) at runtime. */
  applyJurisdiction(jur: JurisdictionConfig): void;
  /** Report a settled round (major units): updates net position + enforces autoplay limits. */
  reportRound(win: number, bet: number): void;
  /** Set the RTP percentage shown by the RTP readout (when `displayRTP`). */
  setRtp(percent: number): void;
  /** Master mute / unmute (music + sfx). */
  setMuted(muted: boolean): void;
  /** Show a menu-style notice modal: declarative blocks + optional action buttons. */
  showNotice(blocks: BlockSpec[], actions?: NoticeAction[]): void;
  /** Show a menu-style error modal — `message`/`opts.title` are literal text OR i18n
   *  keys, and `opts.actions` adds custom buttons (e.g. a "Reload"). */
  showError(message: string, opts?: NoticeOptions): void;
  /** Show the default (localizable, per-call overridable) message for an RGS status
   *  code (e.g. `'ERR_IPB'`, `'ERR_IS'`, `'ERR_MAINTENANCE'`). */
  showRgsError(code: string, opts?: RgsErrorOptions): void;
  /** Show a FATAL error: a blocking modal that LOCKS the HUD and is dismissable only
   *  in code (`hideNotice`) — for unrecoverable RGS states. */
  showFatal(message: string, opts?: NoticeOptions): void;
  /** Dismiss the notice / error modal. */
  hideNotice(): void;
  /** Social / sweepstakes mode: one switch swaps gambling wording (+ a coin → GC/SC). */
  setSocial(on: boolean, coin?: string): void;
  /** Switch the spin button to / from its free-spins face: `n > 0` shows "N FS". */
  setFreeSpins(n: number): void;
  /** Enter/leave replay mode (Stake `replay=true`) — locks the HUD + shows a REPLAY badge. */
  setReplay(on: boolean): void;
  /** Show a buy-feature confirm modal (Cancel / Confirm). Texts are literal-or-key. */
  confirmBuy(opts: { title?: string; message?: string; onConfirm: () => void; confirmLabel?: string; cancelLabel?: string }): void;
  /** Slide the whole interactive HUD in / out — bottom controls go down, top ones up
   *  (behind the status-bar plaque). Non-interactive while moving. */
  showControls(): void;
  hideControls(): void;
  setControlsVisible(visible: boolean): void;
  snapshot(): ControlSnapshot[];
  readonly events: EventLog | undefined;
  readonly inputLocked: Signal<boolean>;
  lockInput(): void;
  unlockInput(): void;
  unmount(): void;
  dispose(): void;
}

/**
 * The one-call, out-of-the-box entry: `mountHud(app)` boots the full reference
 * HUD; `mountHud(app, spec, opts)` configures it from one JSON UISpec + renderer
 * art/skins. Pure assembly over `createUI` + `OpenUIPixi` (Charter B9).
 */
export function mountHud(app: Application, spec: UISpec = {}, opts: HudOptions = {}): BootedHud {
  const { hooks, ...pixiOpts } = opts;
  const ui = createUI(spec, hooks);
  // Compose the unified menu (Settings → Paytable → Rules). A Language switch is
  // added automatically when 2+ locales are configured; `spec.rules` is folded in
  // for back-compat. The built-in Music/Sound reuse the real volume controls.
  const locales = spec.locale ? Array.from(new Set([spec.locale.locale, ...Object.keys(spec.locale.messages)])) : [];
  // `menu: false` (e.g. when the host supplies its own HTML menu) skips the Pixi menu.
  const menu = pixiOpts.menu === false ? false : composeMenu(spec.menu, { locales, localeSelectId: spec.localeSelectId, rulesFallback: spec.rules });
  // Game name + version footer (support / certification) — appended to the menu.
  if (menu && spec.game && (spec.game.name || spec.game.version)) {
    menu.push({ kind: 'legal', id: 'openui-game-info', text: [spec.game.name, spec.game.version ? `v${spec.game.version}` : ''].filter(Boolean).join('  ·  ') });
  }
  const pixi = new OpenUIPixi(ui, { ...pixiOpts, menu, statusBar: pixiOpts.statusBar ?? spec.statusBar });
  pixi.mount(app);

  // The reality-check reminder (RTS 13) is now wired in `createUI` (core), so it runs
  // on a wall-clock timer regardless of renderer — nothing to schedule here.

  // Extra declarative panels (beyond the settings menu) render as their own layers.
  const extra: PanelBodyView[] = [];
  if (spec.panels?.length) {
    for (const ps of spec.panels) {
      const built = buildPanel(ps, ui.bus);
      ui.register(built.panel);
      for (const c of built.controls) ui.register(c);
      const view = new PanelBodyView(built.panel, built.controls, built.blocks, ui, app.ticker, {
        controlSkins: pixiOpts.controlSkins,
      });
      pixi.root.addChild(view);
      view.applyLayout(ui.screen.get());
      extra.push(view);
    }
  }
  const offRelayout = ui.screen.subscribe(() => {
    const s = ui.screen.get();
    for (const v of extra) v.applyLayout(s);
  });

  const teardown = (): void => {
    offRelayout();
    for (const v of extra) v.dispose();
    extra.length = 0;
    pixi.unmount();
    ui.dispose(); // tear down the headless subscriptions too (Charter P12)
  };

  function on<K extends keyof OpenUIEvents>(type: K, fn: (p: OpenUIEvents[K]) => void): Dispose {
    return ui.on(type, fn);
  }

  return {
    ui,
    pixi,
    on,
    setBalance: (n) => ui.balance.set(n),
    setBet: (n) => ui.bet.set(n),
    setCurrency: (c) => {
      ui.balance.setCurrency(c);
      ui.bet.setCurrency(c);
      ui.netPosition.setCurrency(c);
    },
    applyJurisdiction: (j) => ui.applyJurisdiction(j),
    reportRound: (win, bet) => ui.reportRound(win, bet),
    setRtp: (p) => ui.rtp.set(p),
    setMuted: (m) => ui.setMuted(m),
    showNotice: (blocks, actions) => ui.showNotice(blocks, actions),
    showError: (message, opts) => ui.showError(message, opts),
    showRgsError: (code, opts) => ui.showRgsError(code, opts),
    showFatal: (message, opts) => ui.showFatal(message, opts),
    hideNotice: () => ui.hideNotice(),
    setSocial: (on, coin) => ui.setSocial(on, coin),
    setFreeSpins: (n) => ui.spin.setFreeSpins(n),
    setReplay: (on) => ui.setReplay(on),
    confirmBuy: (o) => {
      // Real guard: a jurisdiction that disabled buy-feature makes this a no-op.
      if (ui.isDisabled('buyFeature')) return;
      ui.showNotice(
        [
          { kind: 'heading', id: 'buy-title', text: o.title ?? 'openui.buyFeature.title' },
          { kind: 'callout', id: 'buy-body', tone: 'bonus', text: o.message ?? 'openui.buyFeature.message' },
        ],
        [
          { label: o.cancelLabel ?? 'openui.cancel', variant: 'secondary' },
          { label: o.confirmLabel ?? 'openui.confirm', variant: 'primary', onSelect: o.onConfirm },
        ],
      );
    },
    showControls: () => pixi.setControlsVisible(true),
    hideControls: () => pixi.setControlsVisible(false),
    setControlsVisible: (v) => pixi.setControlsVisible(v),
    snapshot: () => ui.snapshot(),
    events: pixi.eventLog,
    inputLocked: ui.locked,
    lockInput: () => ui.lock(),
    unlockInput: () => ui.unlock(),
    unmount: teardown,
    dispose: teardown,
  };
}
