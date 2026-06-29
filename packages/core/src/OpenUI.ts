import { Signal, type Dispose } from './signal';
import { EventBus } from './events';
import { Control } from './control/Control';
import { SpinControl } from './controls/SpinControl';
import { ValueDisplay } from './controls/ValueDisplay';
import { ButtonControl } from './controls/ButtonControl';
import { SliderControl } from './controls/SliderControl';
import { PanelControl } from './controls/PanelControl';
import { TurboControl } from './controls/TurboControl';
import { StepperControl } from './controls/StepperControl';
import { AutoplayControl } from './controls/AutoplayControl';
import { ReadoutControl } from './controls/ReadoutControl';
import { defaultTheme, type Theme } from './theme/tokens';
import {
  computeScreen,
  defaultLayoutConfig,
  type LayoutConfig,
  type ScreenState,
} from './layout/screen';
import type { ControlSnapshot, OpenUIEvents } from './types';
import type { UISpec, BlockSpec } from './spec/types';
import { applyJurisdiction as applyJurisdictionTo, type JurisdictionConfig } from './spec/jurisdiction';
import {
  type NoticeAction,
  type NoticeOptions,
  type RgsErrorOptions,
  type RealityCheckOptions,
  RGS_ERROR_KEYS,
  DEFAULT_NOTICE_ACTION,
  errorBlocks,
} from './notice';
import { DictionaryTranslator, type Translator } from './i18n/translator';
import { resolveCurrency } from './format/currency';

export interface OpenUIOptions {
  theme?: Theme;
  layout?: LayoutConfig;
  /** i18n port. Default: an empty dictionary on locale 'en' (keys fall through). */
  translator?: Translator;
  /** Start with audio muted (the icon reflects it). Unmute restores the volumes. */
  startMuted?: boolean;
}

/**
 * The headless root: owns the control tree, the active theme, the responsive
 * screen state, and the typed event bus. This is the object the game holds and
 * "talks to" (Charter P1/P4). Renderer-agnostic — a renderer binds to it.
 */
export class OpenUI {
  readonly theme: Theme;
  readonly layoutConfig: LayoutConfig;
  readonly bus = new EventBus<OpenUIEvents>();
  readonly screen: Signal<ScreenState>;

  /** i18n translator (the port — no hard i18next dep, Charter B5/B8). */
  readonly translator: Translator;
  /** Current locale, observable — views re-render their text when it changes. */
  readonly locale: Signal<string>;

  /**
   * Ref-counted input lock. While the count is above zero, `locked` is true and
   * EVERY registered control reports not-interactable through its derived getter
   * (Charter P6/G7) — no per-button bookkeeping, no desync. Instance-scoped: the
   * gate each control receives in `register` reads THIS ui's `locked`.
   */
  readonly locked = new Signal<boolean>(false);
  private lockCount = 0;

  /** Every subscription this ui owns, torn down by `dispose()` (Charter P12). */
  private readonly disposers: Dispose[] = [];

  /** Control ids the spec marked hidden — still registered (so they stay
   *  introspectable in `snapshot()`) but skipped by the renderer (Charter P10). */
  readonly hidden = new Set<string>();
  /** Ids hidden UNCONDITIONALLY (e.g. a jurisdiction `disabled*` flag): `setHidden`
   *  refuses to re-show these, so a responsive resize can't undo a compliance hide. */
  readonly forceHidden = new Set<string>();

  /** Master mute (music+sfx), observable so an icon can reflect it. */
  readonly muted = new Signal<boolean>(false);
  /** Social / sweepstakes mode: swaps gambling wording (Bet/Buy → social terms) and,
   *  paired with a social coin, shows GC/SC. Toggle with {@link setSocial}. */
  readonly social = new Signal<boolean>(false);
  /** Declarative blocks backing the menu-style notice/error modal. */
  readonly noticeBlocks = new Signal<BlockSpec[]>([]);
  /** Action buttons for the notice/error modal (a single dismiss when empty). */
  readonly noticeActions = new Signal<NoticeAction[]>([]);
  /** Whether the open notice is a BLOCKING/fatal modal — no backdrop/✕ dismiss and
   *  the HUD is locked; it can be removed only in code (`hideNotice`). */
  readonly noticeBlocking = new Signal<boolean>(false);
  private noticeLockHeld = false;
  /** Cumulative amount staked this session (major units) — RTS 12 "money spent". */
  readonly totalStaked = new Signal<number>(0);
  /** Cumulative amount won this session (major units). */
  readonly totalWon = new Signal<number>(0);
  /** The Stake jurisdiction config currently applied (read-back for guards/queries). */
  jurisdiction: Readonly<JurisdictionConfig> = {};
  /** Replay mode (Stake `replay=true`): the HUD locks + a REPLAY badge shows. */
  readonly replay = new Signal<boolean>(false);
  /** Game name + version (shown in the menu footer; for support / certification). */
  gameInfo: { name?: string; version?: string } = {};
  /** Minimum round duration (ms) from jurisdiction — stored for the GAME to enforce. */
  minimumRoundDuration = 0;
  private sessionNet = 0;
  private prevVolumes: { music: number; sfx: number } | null = null;

  /** The frozen UISpec `createUI` built this from, if any — authored = run = tested. */
  spec?: Readonly<UISpec>;

  /** Typed convenience handles for the controls. */
  readonly spin: SpinControl;
  readonly balance: ValueDisplay;
  readonly bet: ValueDisplay;
  readonly settingsButton: ButtonControl;
  readonly settingsPanel: PanelControl;
  readonly musicSlider: SliderControl;
  readonly sfxSlider: SliderControl;
  readonly turbo: TurboControl;
  readonly autoplay: AutoplayControl;
  readonly bonusButton: ButtonControl;
  readonly betStepper: StepperControl;
  readonly betPlus: ButtonControl;
  readonly betMinus: ButtonControl;
  readonly fullscreenButton: ButtonControl;
  readonly muteButton: ButtonControl;
  /** Compliance display readouts — hidden until a jurisdiction reveals them. */
  readonly rtp: ReadoutControl;
  readonly netPosition: ReadoutControl;
  readonly sessionTimer: ReadoutControl;
  /** Menu-style notice/error modal (content set via `showNotice`). */
  readonly noticePanel: PanelControl;

  private readonly controls = new Map<string, Control>();

  constructor(opts: OpenUIOptions = {}) {
    this.theme = opts.theme ?? defaultTheme;
    this.layoutConfig = opts.layout ?? defaultLayoutConfig;
    this.screen = new Signal<ScreenState>(computeScreen(1920, 1080, this.layoutConfig));

    this.translator = opts.translator ?? new DictionaryTranslator({}, 'en');
    this.locale = new Signal<string>(this.translator.locale);
    this.disposers.push(
      this.translator.onChange((loc) => {
        if (this.locale.get() === loc) return;
        this.locale.set(loc);
        this.bus.emit('localeChanged', loc);
      }),
    );

    this.spin = new SpinControl({ layout: { anchor: 'bottom-center', offset: [0, -440] } }, this.bus);

    this.balance = new ValueDisplay({
      id: 'balance',
      label: 'openui.balance', // i18n key → localizes + swaps in social mode
      layout: { anchor: 'bottom-left', offset: [220, -96] },
      currency: { code: 'USD', decimals: 2 },
      initial: 1000,
    });
    this.bet = new ValueDisplay({
      id: 'bet',
      label: 'openui.bet',
      layout: { anchor: 'bottom-right', offset: [-220, -96] },
      currency: { code: 'USD', decimals: 2 },
      initial: 1,
    });

    // settings flyout: a button that toggles a popover with sound sliders + a Rules button
    this.settingsButton = new ButtonControl(
      { id: 'settings', layout: { anchor: 'bottom-center', offset: [400, -440] } },
      this.bus,
    );
    this.settingsPanel = new PanelControl(
      { id: 'settings-panel', variant: 'popover', layout: { anchor: 'bottom-right', offset: [-24, -470] } },
      this.bus,
    );
    this.musicSlider = new SliderControl({ id: 'music', label: 'Music', layout: { anchor: 'center' }, initial: 0.7 }, this.bus);
    this.sfxSlider = new SliderControl({ id: 'sfx', label: 'Sound', layout: { anchor: 'center' }, initial: 0.5 }, this.bus);

    // bottom-bar controls
    this.bonusButton = new ButtonControl({ id: 'bonus', layout: { anchor: 'bottom-center', offset: [-400, -440] } }, this.bus);
    this.autoplay = new AutoplayControl(
      { id: 'autoplay', layout: { anchor: 'bottom-center', offset: [-225, -440] }, options: [5, 10, 25, 50, 100, Infinity] },
      this.bus,
    );
    this.turbo = new TurboControl({ id: 'turbo', layout: { anchor: 'bottom-center', offset: [225, -440] } }, this.bus);
    this.betMinus = new ButtonControl({ id: 'bet-minus', layout: { anchor: 'bottom-center', offset: [-150, -270] } }, this.bus);
    this.betPlus = new ButtonControl({ id: 'bet-plus', layout: { anchor: 'bottom-center', offset: [150, -270] } }, this.bus);
    this.betStepper = new StepperControl({ id: 'bet-stepper', layout: { anchor: 'center' }, levels: [0.5, 1, 2, 5, 10, 20], index: 1 }, this.bus);

    // edge controls: master mute + fullscreen (icon buttons at the screen corner)
    // Figma "default": two prominent b&w round buttons in the top-right corner with a
    // comfortable edge margin (sound on the left, fullscreen on the right).
    this.muteButton = new ButtonControl({ id: 'mute', layout: { anchor: 'top-right', offset: [-122, 46] } }, this.bus);
    this.fullscreenButton = new ButtonControl({ id: 'fullscreen', layout: { anchor: 'top-right', offset: [-46, 46] } }, this.bus);

    // compliance readouts — created hidden; a jurisdiction's display* flag reveals them
    // Figma "default" compliance block: three plain `Label: value` lines stacked in
    // the top-left corner (RTP · Session Time · Net).
    this.rtp = new ReadoutControl({ id: 'rtp', kind: 'percent', label: 'RTP', layout: { anchor: 'top-left', offset: [20, 18] } });
    this.sessionTimer = new ReadoutControl({ id: 'session-timer', kind: 'duration', label: 'Session Time', layout: { anchor: 'top-left', offset: [20, 46] } });
    this.netPosition = new ReadoutControl({ id: 'net-position', kind: 'currency', label: 'Net', currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }, layout: { anchor: 'top-left', offset: [20, 74] } });

    // notice / error modal (rendered in the unified menu style)
    this.noticePanel = new PanelControl({ id: 'notice-panel', variant: 'modal', layout: { anchor: 'center' } }, this.bus);

    for (const c of [
      this.spin,
      this.balance,
      this.bet,
      this.settingsButton,
      this.settingsPanel,
      this.musicSlider,
      this.sfxSlider,
      this.bonusButton,
      this.autoplay,
      this.turbo,
      this.betMinus,
      this.betPlus,
      this.betStepper,
      this.muteButton,
      this.fullscreenButton,
      this.rtp,
      this.netPosition,
      this.sessionTimer,
      this.noticePanel,
    ]) {
      this.register(c);
    }

    // compliance readouts start hidden — applyJurisdiction reveals the mandated ones
    this.hidden.add('rtp');
    this.hidden.add('net-position');
    this.hidden.add('session-timer');
    // The buy/bonus button is hidden until a host configures a buy feature (reveal it
    // with `controls.bonus.hidden = false` or `ui.setHidden('bonus', false)`) — so a
    // game with nothing to buy never shows a stray, purposeless button.
    this.hidden.add('bonus');

    // the library owns this navigation (a biased, stateful UI)
    this.bus.on('buttonActivated', ({ id }) => {
      if (id === 'settings') this.settingsPanel.toggle();
      else if (id === 'bet-plus') {
        this.betStepper.inc();
      } else if (id === 'bet-minus') {
        this.betStepper.dec();
      } else if (id === 'mute') {
        this.toggleMute();
      }
    });

    // bet stepper drives the bet value display + keeps +/- enabled within range
    this.bus.on('valueChanged', ({ id, value }) => {
      if (id === 'bet-stepper') this.bet.set(value);
    });
    const syncStepperButtons = (): void => {
      this.betStepper.canInc ? this.betPlus.enable() : this.betPlus.disable();
      this.betStepper.canDec ? this.betMinus.enable() : this.betMinus.disable();
    };
    this.disposers.push(this.betStepper.index.subscribe(syncStepperButtons));
    this.bet.set(this.betStepper.value);
    syncStepperButtons();

    // When the notice/error modal closes, release a blocking lock + announce it.
    this.disposers.push(
      this.noticePanel.state.subscribe(() => {
        if (this.noticePanel.isOpen) return;
        if (this.noticeLockHeld) {
          this.unlock();
          this.noticeLockHeld = false;
        }
        if (this.noticeBlocking.get()) this.noticeBlocking.set(false);
        this.bus.emit('noticeDismissed', undefined);
      }),
    );

    if (opts.startMuted) this.setMuted(true);
  }

  register(control: Control): void {
    this.controls.set(control.id, control);
    control.gate = () => !this.locked.get();
    this.disposers.push(
      control.onTransition((_t, to, from) => {
        this.bus.emit('stateChanged', { id: control.id, from, to });
      }),
    );
  }

  control(id: string): Control | undefined {
    return this.controls.get(id);
  }

  all(): Control[] {
    return [...this.controls.values()];
  }

  /** Renderer calls this on resize; recomputes breakpoint + fit scale. */
  setScreen(width: number, height: number): void {
    this.screen.set(computeScreen(width, height, this.layoutConfig));
  }

  /**
   * Hide or show a control at runtime and tell the renderer (Charter P10). The
   * control stays registered — still in `snapshot()` — but the view is not drawn.
   * Used by the responsive layer to drop controls on small screens.
   */
  setHidden(id: string, hidden: boolean): void {
    if (!hidden && this.forceHidden.has(id)) return; // jurisdiction-locked: can't re-show
    const was = this.hidden.has(id);
    if (hidden === was) return;
    if (hidden) this.hidden.add(id);
    else this.hidden.delete(id);
    this.bus.emit('visibilityChanged', { id, hidden });
  }

  /** Push the ref-counted input lock (e.g. for the duration of a spin round). */
  lock(): void {
    this.lockCount += 1;
    if (this.lockCount === 1) this.locked.set(true);
  }

  /** Pop the lock; the HUD becomes interactable again only at zero. */
  unlock(): void {
    if (this.lockCount === 0) return;
    this.lockCount -= 1;
    if (this.lockCount === 0) this.locked.set(false);
  }

  /** Toggle master mute (music + sfx). */
  toggleMute(): void {
    this.setMuted(!this.muted.get());
  }

  /** Mute/unmute music+sfx, remembering the levels to restore on unmute. */
  setMuted(m: boolean): void {
    if (m === this.muted.get()) return;
    if (m) {
      this.prevVolumes = { music: this.musicSlider.value.get(), sfx: this.sfxSlider.value.get() };
      this.musicSlider.setNormalized(0);
      this.sfxSlider.setNormalized(0);
    } else if (this.prevVolumes) {
      this.musicSlider.setNormalized(this.prevVolumes.music);
      this.sfxSlider.setNormalized(this.prevVolumes.sfx);
      this.prevVolumes = null;
    }
    this.muted.set(m);
  }

  /**
   * Report one completed round (major units): updates the net-position readout and,
   * while autoplay is running, advances its count + enforces its RG loss/single-win
   * limits. One feed point powers both `displayNetPosition` and the autoplay stops.
   */
  reportRound(win: number, bet: number): void {
    if (!Number.isFinite(win) || !Number.isFinite(bet)) return;
    this.sessionNet += win - bet;
    this.netPosition.set(this.sessionNet);
    this.totalStaked.set(this.totalStaked.get() + bet);
    this.totalWon.set(this.totalWon.get() + win);
    if (this.autoplay.isActive) {
      this.autoplay.reportResult(win, bet);
      // auto-stop autoplay when the next round is no longer affordable (RG)
      if (this.autoplay.isActive && this.balance.get() < this.bet.get()) this.autoplay.stop();
    }
  }

  /** Reset the running session net + aggregates + timer (e.g. on a fresh session). */
  resetSession(): void {
    this.sessionNet = 0;
    this.netPosition.set(0);
    this.totalStaked.set(0);
    this.totalWon.set(0);
    this.sessionTimer.reset();
  }

  /** Show the menu-style notice modal: declarative blocks + optional action buttons.
   *  Every string (block text + button labels) runs through `ui.t`, so pass exact
   *  literals OR your own i18n keys. Omit `actions` → a single dismiss button. */
  showNotice(blocks: BlockSpec[], actions?: NoticeAction[], opts: { blocking?: boolean } = {}): void {
    const blocking = !!opts.blocking;
    this.noticeBlocks.set(Array.isArray(blocks) ? blocks : []);
    // A blocking modal with no actions is dismissable ONLY in code (no default OK).
    this.noticeActions.set(actions && actions.length ? actions : blocking ? [] : [DEFAULT_NOTICE_ACTION]);
    this.noticeBlocking.set(blocking);
    // Keep the blocking lock in step even if one notice REPLACES another while open
    // (openPanel is idempotent, so the close-subscription wouldn't fire to release it).
    if (blocking && !this.noticeLockHeld) {
      this.lock();
      this.noticeLockHeld = true;
    } else if (!blocking && this.noticeLockHeld) {
      this.unlock();
      this.noticeLockHeld = false;
    }
    this.noticePanel.openPanel();
    this.bus.emit('noticeShown', { blocking });
  }

  /** Show a simple error/notice: a title + a tone-coloured message. `message` and
   *  `opts.title` are literal-or-key (localized via `ui.t`); `opts.actions` adds
   *  custom buttons (e.g. a "Reload"). `opts.blocking` → a fatal modal (locks the
   *  HUD, no backdrop/✕ dismiss; removable only via `hideNotice`). */
  showError(message: string, opts: NoticeOptions = {}): void {
    this.showNotice(errorBlocks(message, opts.title ?? 'openui.error', opts.tone ?? 'warning'), opts.actions, {
      blocking: opts.blocking,
    });
  }

  /** Show a FATAL error: a blocking modal that locks the HUD and can be removed only
   *  in code (`hideNotice`) — for unrecoverable RGS states. Pass `actions` (e.g. a
   *  "Reload" that reloads the page) for the only way out. */
  showFatal(message: string, opts: NoticeOptions = {}): void {
    this.showError(message, { ...opts, blocking: true });
  }

  /** Show the default (localizable, overridable) message for an RGS status code.
   *  Override the exact text per call via `opts.title` / `opts.message`. Stops an
   *  active autoplay by default (`opts.stopAutoplay = false` to keep it). Pass
   *  `opts.blocking` for unrecoverable codes (session expiry, maintenance). */
  showRgsError(code: string, opts: RgsErrorOptions = {}): void {
    const def = RGS_ERROR_KEYS[code] ?? RGS_ERROR_KEYS.ERR_GEN!;
    if (opts.stopAutoplay !== false && this.autoplay.isActive) this.autoplay.stop();
    this.showError(opts.message ?? def.message, {
      title: opts.title ?? def.title,
      tone: opts.tone ?? 'warning',
      actions: opts.actions,
      blocking: opts.blocking,
    });
  }

  /** Close the notice / error modal. */
  hideNotice(): void {
    this.noticePanel.closePanel();
  }

  /** Enter/leave replay mode (Stake `replay=true`) — locks the HUD so no real bet is
   *  placed; the renderer shows a REPLAY badge while it's on. */
  setReplay(on: boolean): void {
    if (on === this.replay.get()) return;
    this.replay.set(on);
    if (on) this.lock();
    else this.unlock();
  }

  /** Apply a Stake Engine `jurisdiction` config to the live HUD (whole switchboard).
   *  The merged config is stored for `isDisabled()` read-back. */
  applyJurisdiction(jur: JurisdictionConfig): void {
    this.jurisdiction = Object.freeze({ ...this.jurisdiction, ...jur });
    applyJurisdictionTo(this, jur);
  }

  /** Tear down every subscription and control this ui created (Charter P12). */
  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    for (const c of this.controls.values()) c.dispose();
    this.controls.clear();
  }

  /**
   * Switch language. Drives the translator (if it can self-switch) and emits
   * `localeChanged`; controls' views, subscribed to `locale`, re-render their text.
   */
  setLocale(next: string): void {
    // The translator owns locale state; its onChange handler (wired in the
    // constructor) updates `locale` and emits localeChanged. No-op for same locale.
    this.translator.setLocale(next);
  }

  /** Translate a key (or pass plain text through) via the active translator. Social
   *  wording is resolved by the translator from a SEPARATE social dictionary (see
   *  `setSocial`), so gambling and social copy can never be mixed by accident. */
  t(key: string, vars?: Record<string, string | number>): string {
    return this.translator.t(key, vars);
  }

  /**
   * Turn social / sweepstakes mode on or off (one switch). Flips the translator to
   * its SEPARATE social dictionary (Bet→Play, Buy feature→Play bonus, etc.) and,
   * when a `coin` is given (e.g. `'GC'`/`'SC'`), shows balance/bet/net in that coin.
   * Wording re-renders live. Social copy lives in `locale.socialMessages` — kept
   * apart from your normal `locale.messages` by design.
   */
  setSocial(on: boolean, coin?: string): void {
    if (on !== this.social.get()) {
      this.social.set(on);
      this.translator.setSocial?.(on);
      this.locale.update(() => {}); // nudge text views (they subscribe to `locale`) to re-translate
    }
    if (coin) {
      const cur = resolveCurrency(coin);
      this.balance.setCurrency(cur);
      this.bet.setCurrency(cur);
      this.netPosition.setCurrency(cur);
    }
  }

  /** Read-back: did the applied jurisdiction disable this feature? (real guard, not
   *  just a hide — `confirmBuy`/autoplay entry points consult this). */
  isDisabled(feature: 'autoplay' | 'buyFeature' | 'turbo' | 'fullscreen' | 'slamstop' | 'spacebar'): boolean {
    const j = this.jurisdiction;
    return (
      (feature === 'autoplay' && !!j.disabledAutoplay) ||
      (feature === 'buyFeature' && !!j.disabledBuyFeature) ||
      (feature === 'turbo' && !!j.disabledTurbo) ||
      (feature === 'fullscreen' && !!j.disabledFullscreen) ||
      (feature === 'slamstop' && !!j.disabledSlamstop) ||
      (feature === 'spacebar' && !!j.disabledSpacebar)
    );
  }

  /**
   * Start a reality-check reminder (RTS 13). Every `everyMinutes` (WALL-CLOCK, so a
   * backgrounded tab can't cheat it) it emits a `realityCheck` event, stops autoplay,
   * and — unless `showModal: false` — shows an acknowledge modal. You provide only
   * the interval + (optional) title/message text; `{{minutes}}`/`{{spent}}`/`{{won}}`
   * are interpolated. Returns a disposer (also torn down by `dispose()`).
   */
  startRealityCheck(opts: RealityCheckOptions): Dispose {
    const everyMs = Math.max(1, opts.everyMinutes) * 60_000;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      // don't stack on an already-open modal — re-check shortly
      if (this.noticePanel.isOpen) {
        timer = setTimeout(tick, 1000);
        return;
      }
      const elapsedMs = Date.now() - last;
      last = Date.now();
      this.fireRealityCheck(opts, elapsedMs);
      timer = setTimeout(tick, everyMs);
    };
    timer = setTimeout(tick, everyMs);
    const dispose = (): void => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    this.disposers.push(dispose);
    return dispose;
  }

  /** Fire one reality check now: emit the event (+ session totals), stop autoplay,
   *  and show the modal unless `showModal:false`. Exposed for manual triggers / tests. */
  fireRealityCheck(opts: RealityCheckOptions, elapsedMs = 0): void {
    const minutes = Math.max(1, Math.round(opts.everyMinutes));
    const totalStaked = this.totalStaked.get();
    const totalWon = this.totalWon.get();
    this.bus.emit('realityCheck', { minutes, elapsedMs, totalStaked, totalWon });
    if (this.autoplay.isActive) this.autoplay.stop();
    if (opts.showModal === false) return;
    const vars = { minutes, spent: totalStaked, won: totalWon };
    this.showNotice(
      [
        { kind: 'heading', id: 'rc-title', text: this.t(opts.title ?? 'openui.realityCheck.title', vars) },
        { kind: 'text', id: 'rc-body', text: this.t(opts.message ?? 'openui.realityCheck.message', vars) },
      ],
      opts.actions ?? [{ label: 'openui.continue', variant: 'primary' }],
    );
  }

  on<K extends keyof OpenUIEvents>(type: K, fn: (payload: OpenUIEvents[K]) => void): Dispose {
    return this.bus.on(type, fn);
  }

  /** Serializable snapshot for the introspection / e2e API (Charter P10). */
  snapshot(): ControlSnapshot[] {
    return this.all().map((c) => {
      const { bounds, animating } = c.inspect();
      return {
        id: c.id,
        role: c.role,
        state: c.current,
        interactable: c.interactable,
        bounds,
        animating,
      };
    });
  }
}
