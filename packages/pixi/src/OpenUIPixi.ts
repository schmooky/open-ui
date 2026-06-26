import { Container, Graphics, Text, type Application, type Texture, type Ticker } from 'pixi.js';
import {
  type OpenUI,
  type BlockSpec,
  type ScreenState,
  EventLog,
  buildBlocks,
  buttonBlocks,
  composeMenu,
} from '@open-ui/core';
import { type ControlView } from './views/ControlView';
import { SpinView } from './views/SpinView';
import { ValueDisplayView } from './views/ValueDisplayView';
import { ButtonView } from './views/ButtonView';
import { TurboView } from './views/TurboView';
import { AutoplayView } from './views/AutoplayView';
import { AutoplayDrawerView } from './views/AutoplayDrawerView';
import { MenuView } from './views/MenuView';
import { ReadoutView } from './views/ReadoutView';
import { DialogView } from './views/DialogView';
import { StatusBarView, type StatusBarSide } from './views/StatusBarView';
import { type ControlViewFactory } from './views/blockColumn';
import { type SpinSkinFactory } from './skin/SpinSkin';
import { type GsapLike } from 'pixi-text-counter';

export interface OpenUIIcons {
  settingsIdle?: Texture;
  settingsActive?: Texture;
  close?: Texture;
  rules?: Texture;
  sliderMusic?: Texture;
  sliderSound?: Texture;
  turboOff?: Texture;
  turboOn?: Texture;
  /** One texture per turbo mode (index-aligned) — for 3-mode art. Wins over off/on. */
  turboModes?: Texture[];
  autoIdle?: Texture;
  autoActive?: Texture;
  bonus?: Texture;
  betPlus?: Texture;
  betMinus?: Texture;
}

export interface OpenUIPixiOptions {
  /** Expose `window.__OPENUI__` for e2e/introspection. Default true. */
  expose?: boolean;
  /** Override the spin control's skin (default = the art-free Graphics placeholder). */
  spinSkin?: SpinSkinFactory;
  /** Real art for the menu/close/slider controls (else neutral placeholders). */
  icons?: OpenUIIcons;
  /**
   * The composed MENU blocks (Settings → Paytable → Rules) the ☰ button opens in a
   * scrollable sheet. Usually built by `mountHud` via `composeMenu(spec.menu, …)`;
   * omitted → a default Settings-only menu (Music/Sound). Pass `false` to skip the
   * built-in Pixi menu entirely (e.g. when supplying your own HTML/DOM menu).
   */
  menu?: BlockSpec[] | false;
  /** Header title for the menu sheet (localizable). Default 'Menu'. */
  menuTitle?: string;
  /** Per-id view override — swap a control's renderer without forking (Charter P7). */
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /**
   * Host `gsap` — enables the value counter's auto-downscale so wide currencies
   * (8-decimal BTC, big SATS counts, long codes) shrink to fit instead of spilling.
   * Kept out of the lib's deps (Charter B5); the host passes its own gsap.
   */
  gsap?: GsapLike;
  /**
   * Autoplay count-picker presentation. `'drawer'` (default) is a bottom sheet;
   * `'radial'` fans the count chips around the spin button.
   */
  autoplayPicker?: 'drawer' | 'radial';
  /**
   * Put the compliance readouts (net · RTP · session) in a thin status strip at the
   * `'top'` or `'bottom'` edge instead of at screen corners. Each readout still only
   * shows when its jurisdiction `display*` flag is set.
   */
  statusBar?: StatusBarSide;
  /**
   * How the interactive HUD appears on mount: `'shown'` (default), `'hidden'` (off
   * screen + non-interactive; reveal later with `showControls()`), or `'slide-in'`
   * (start hidden, then slide in from the edges).
   */
  intro?: 'shown' | 'hidden' | 'slide-in';
}

/** Smooth S-curve for the show/hide slide (translation only — no scaling). */
function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * The controller: mounts ONE root Container onto the host's existing stage,
 * shares the host ticker/renderer, drives resize, and exposes introspection.
 * `unmount()` removes the layer and every listener it created (Charter P2/P12).
 */
export class OpenUIPixi {
  readonly root = new Container();
  private readonly views: ControlView[] = [];
  /** Full-screen overlays (e.g. the autoplay drawer) that own their own layout. */
  private readonly overlays: Array<{ applyLayout(s: ScreenState): void; dispose(): void }> = [];
  private readonly disposers: Array<() => void> = [];
  private _eventLog?: EventLog;
  /** Show/hide slide: each interactive view slides toward its anchored edge (bottom
   *  controls down, top up — behind the status-bar plaque). Views stay direct children
   *  of `root` (introspection bounds unchanged); only their y moves, and the
   *  ref-counted input lock makes them non-interactive while moving/hidden. */
  private slideProg = 0; // 0 = shown · 1 = fully hidden (set per `intro` on mount)
  private slideTarget = 1;
  private slideHeld = false;
  private lastScreenH = 1080;
  private appTicker?: Ticker;
  private slideTickFn?: (t: Ticker) => void;
  private readonly slideBaseY = new Map<ControlView, number>();
  private readonly slideSign = new Map<ControlView, number>();

  constructor(
    private readonly ui: OpenUI,
    private readonly opts: OpenUIPixiOptions = {},
  ) {}

  /** The bus event log backing `window.__OPENUI__.events` (available after mount). */
  get eventLog(): EventLog | undefined {
    return this._eventLog;
  }

  mount(app: Application): void {
    const { stage, renderer, ticker } = app;
    this.appTicker = ticker;
    stage.sortableChildren = true;
    this.root.zIndex = 10_000;
    this.root.sortableChildren = true;
    stage.addChild(this.root);

    const ic = this.opts.icons ?? {};

    // spin + balance/bet value displays
    const spinView = new SpinView(this.ui.spin, this.ui, ticker, this.opts.spinSkin);
    const balanceView = new ValueDisplayView(this.ui.balance, this.ui, ticker, this.opts.gsap);
    const betView = new ValueDisplayView(this.ui.bet, this.ui, ticker, this.opts.gsap);

    // settings button (☰) → the unified scrollable MENU (settings/paytable/rules)
    const settingsView = new ButtonView(this.ui.settingsButton, this.ui, ticker, {
      shape: 'circle',
      radius: 40,
      glyph: 'menu',
      iconTexture: ic.settingsIdle,
      iconTarget: 88,
      mono: true, // b&w like the turbo button (used on the drawn glyph path)
    });
    settingsView.zIndex = 5;

    // `menu: false` skips the built-in Pixi menu (e.g. a host-supplied HTML menu).
    const menuView = this.opts.menu === false ? undefined : this.buildMenu(ticker);

    // bottom bar: turbo / autoplay / bonus / bet ± stepper
    const turboView = new TurboView(this.ui.turbo, this.ui, ticker, {
      offTexture: ic.turboOff,
      onTexture: ic.turboOn,
      modeTextures: ic.turboModes,
      target: 88,
    });
    const spinOff = this.ui.spin.layout.offset ?? [0, 0];
    const autoOff = this.ui.autoplay.layout.offset ?? [0, 0];
    const picker = this.opts.autoplayPicker ?? 'drawer';
    const autoplayView = new AutoplayView(this.ui.autoplay, this.ui, ticker, {
      idleTexture: ic.autoIdle,
      activeTexture: ic.autoActive,
      target: 88,
      picker,
      arcCenter: { x: spinOff[0] - autoOff[0], y: spinOff[1] - autoOff[1] },
      arcStepDeg: 22,
    });
    autoplayView.zIndex = 20;
    const bonusView = new ButtonView(this.ui.bonusButton, this.ui, ticker, { shape: 'circle', radius: 44, iconTexture: ic.bonus, iconTarget: 110 });
    const betPlusView = new ButtonView(this.ui.betPlus, this.ui, ticker, { shape: 'circle', radius: 30, iconTexture: ic.betPlus, iconTarget: 64 });
    const betMinusView = new ButtonView(this.ui.betMinus, this.ui, ticker, { shape: 'circle', radius: 30, iconTexture: ic.betMinus, iconTarget: 64 });

    // edge controls (master mute + fullscreen) — b&w "mono" buttons like turbo.
    const muteView = new ButtonView(this.ui.muteButton, this.ui, ticker, { shape: 'circle', radius: 22, glyph: 'speaker', iconTarget: 44, mono: true });
    const fullscreenView = new ButtonView(this.ui.fullscreenButton, this.ui, ticker, { shape: 'circle', radius: 22, glyph: 'fullscreen', iconTarget: 44, mono: true });
    muteView.zIndex = 65; // above the status bar (60) so they read as part of it
    fullscreenView.zIndex = 65;
    // Compliance readouts (RTP / net / session): in a thin status bar if configured,
    // else at screen corners. Bar items are created inline by the StatusBarView.
    const statusBarSide = this.opts.statusBar;
    const rtpView = statusBarSide ? undefined : new ReadoutView(this.ui.rtp, this.ui, ticker);
    const netView = statusBarSide ? undefined : new ReadoutView(this.ui.netPosition, this.ui, ticker);
    const timerView = statusBarSide ? undefined : new ReadoutView(this.ui.sessionTimer, this.ui, ticker);

    // Every view is mounted; `ui.hidden` only toggles VISIBILITY (so a responsive
    // breakpoint can show/hide a control at runtime — Charter P10). Hidden views
    // stay laid out + introspectable in snapshot, they're just not drawn.
    const entries: Array<[string, ControlView]> = [
      [this.ui.spin.id, spinView],
      [this.ui.balance.id, balanceView],
      [this.ui.bet.id, betView],
      [this.ui.settingsButton.id, settingsView],
      [this.ui.turbo.id, turboView],
      [this.ui.autoplay.id, autoplayView],
      [this.ui.bonusButton.id, bonusView],
      [this.ui.betPlus.id, betPlusView],
      [this.ui.betMinus.id, betMinusView],
      [this.ui.muteButton.id, muteView],
      [this.ui.fullscreenButton.id, fullscreenView],
    ];
    if (rtpView) entries.push([this.ui.rtp.id, rtpView]);
    if (netView) entries.push([this.ui.netPosition.id, netView]);
    if (timerView) entries.push([this.ui.sessionTimer.id, timerView]);
    const viewById = new Map<string, ControlView>();
    const idByView = new Map<ControlView, string>();
    for (const [id, view] of entries) {
      view.visible = !this.ui.hidden.has(id);
      this.root.addChild(view);
      this.views.push(view);
      viewById.set(id, view);
      idByView.set(view, id);
    }
    this.disposers.push(
      this.ui.on('visibilityChanged', ({ id, hidden }) => {
        const v = viewById.get(id);
        if (v) v.visible = !hidden;
      }),
    );

    // master mute icon reflects the mute state (speaker ↔ speaker-mute)
    this.disposers.push(this.ui.muted.subscribe((m) => muteView.setGlyph(m ? 'speaker-mute' : 'speaker')));

    // fullscreen: the view stays DOM-agnostic, so the controller owns the toggle and
    // keeps the glyph in sync with the actual document fullscreen state.
    if (typeof document !== 'undefined') {
      this.disposers.push(
        this.ui.bus.on('buttonActivated', ({ id }) => {
          if (id !== 'fullscreen') return;
          const el = (app.canvas.parentElement ?? document.documentElement) as HTMLElement;
          if (document.fullscreenElement) void document.exitFullscreen?.();
          else void el.requestFullscreen?.();
        }),
      );
      const onFsChange = (): void => fullscreenView.setGlyph(document.fullscreenElement ? 'fullscreen-exit' : 'fullscreen');
      document.addEventListener('fullscreenchange', onFsChange);
      this.disposers.push(() => document.removeEventListener('fullscreenchange', onFsChange));
    }

    // Keyboard spin (Space / Enter), gated by jurisdiction (`disabledSpacebar`) + the
    // lock. RTS 14D: one spin per press — no auto-repeat by holding the key.
    if (typeof window !== 'undefined') {
      let keyHeld = false;
      const onKeyDown = (e: KeyboardEvent): void => {
        if (e.code !== 'Space' && e.key !== 'Enter') return;
        if (!this.ui.spin.allowKeyboard.get() || e.repeat || keyHeld) return;
        keyHeld = true;
        e.preventDefault();
        if (this.ui.spin.interactable) this.ui.spin.activate();
      };
      const onKeyUp = (e: KeyboardEvent): void => {
        if (e.code === 'Space' || e.key === 'Enter') keyHeld = false;
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      this.disposers.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });
    }

    // The menu is a full-screen overlay that manages its OWN open/closed visibility
    // (driven by the panel state) — so it's an overlay, not a force-visible view.
    if (menuView) {
      this.root.addChild(menuView);
      this.overlays.push(menuView);
    }

    // The autoplay bottom drawer (the options-mode picker) is a full-screen overlay.
    if (picker === 'drawer') {
      const drawer = new AutoplayDrawerView(this.ui.autoplay, this.ui, ticker);
      this.root.addChild(drawer);
      this.overlays.push(drawer);
    }

    // The menu-style notice / error modal (owns its open/closed visibility → overlay).
    const dialog = new DialogView(this.ui.noticePanel, this.ui.noticeBlocks, this.ui.noticeActions, this.ui, ticker, { controlSkins: this.opts.controlSkins });
    this.root.addChild(dialog);
    this.overlays.push(dialog);

    // Optional status bar (net · RTP · session) pinned to the top/bottom edge.
    if (statusBarSide) {
      const bar = new StatusBarView([this.ui.netPosition, this.ui.rtp, this.ui.sessionTimer], this.ui, ticker, statusBarSide);
      this.root.addChild(bar);
      this.overlays.push(bar);
    }

    // REPLAY badge (Stake replay mode) — a pill shown while `ui.replay` is true.
    const replayBadge = new Container();
    const replayBg = new Graphics();
    const replayText = new Text({ text: this.ui.t('openui.replay').toUpperCase(), style: { fontFamily: this.ui.theme.type.family, fontSize: 16, fontWeight: '800', fill: 0xffffff, letterSpacing: 2 } });
    replayText.anchor.set(0.5);
    replayBadge.addChild(replayBg, replayText);
    replayBadge.zIndex = 310;
    replayBadge.visible = this.ui.replay.get();
    this.root.addChild(replayBadge);
    this.overlays.push({
      applyLayout: (s) => {
        const w = replayText.width + 36;
        const h = 32;
        replayBg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x0c0d10 }).stroke({ width: 2, color: 0xffffff });
        const top = statusBarSide === 'top' ? StatusBarView.heightFor(s) + 28 : 40;
        replayBadge.position.set(s.width / 2, top);
      },
      dispose: () => {
        if (!replayBadge.destroyed) replayBadge.destroy({ children: true });
      },
    });
    this.disposers.push(
      this.ui.replay.subscribe((v) => {
        replayBadge.visible = v;
      }),
      this.ui.locale.subscribe(() => {
        if (!replayBadge.destroyed) replayText.text = this.ui.t('openui.replay').toUpperCase();
      }),
    );

    // the settings button toggles ☰ ↔ ✕ with the popover's open state
    if (ic.settingsIdle && ic.settingsActive) {
      const idle = ic.settingsIdle;
      const active = ic.settingsActive;
      this.disposers.push(
        this.ui.settingsPanel.state.subscribe(() => {
          settingsView.setIconTexture(this.ui.settingsPanel.isOpen ? active : idle);
        }),
      );
    } else {
      // no art → the mono ☰ glyph toggles to ✕ when the menu opens
      this.disposers.push(
        this.ui.settingsPanel.state.subscribe(() => {
          settingsView.setGlyph(this.ui.settingsPanel.isOpen ? 'close' : 'menu');
        }),
      );
    }

    const applyLayout = (): void => {
      const screen = this.ui.screen.get();
      // A status bar insets the HUD by its height on that edge — controls anchored to
      // the same edge shift away, as if the bar added a margin to them.
      const barH = statusBarSide ? StatusBarView.heightFor(screen) : 0;
      this.slideBaseY.clear();
      this.slideSign.clear();
      for (const v of this.views) {
        v.applyLayout(screen);
        const anchor = this.ui.control(idByView.get(v) ?? '')?.layout.anchor ?? 'bottom-center';
        if (barH) {
          if (statusBarSide === 'top' && anchor.startsWith('top')) v.y += barH;
          else if (statusBarSide === 'bottom' && anchor.startsWith('bottom')) v.y -= barH;
        }
        // record the resting y + slide direction (top controls up, the rest down)
        this.slideBaseY.set(v, v.y);
        this.slideSign.set(v, anchor.startsWith('top') ? -1 : 1);
      }
      this.lastScreenH = screen.height;
      this.applySlide();
      for (const o of this.overlays) o.applyLayout(screen);
    };
    const onResize = (): void => {
      this.ui.setScreen(app.screen.width, app.screen.height);
    };

    renderer.on('resize', onResize);
    const unsubScreen = this.ui.screen.subscribe(applyLayout);
    onResize();
    applyLayout();

    // Initial HUD visibility (configurable via `intro`): shown / hidden / slide-in.
    const intro = this.opts.intro ?? 'shown';
    if (intro === 'shown') {
      this.slideProg = 0;
      this.applySlide();
    } else {
      this.slideProg = 1; // start off-screen
      this.applySlide();
      this.ui.lock(); // non-interactive while hidden
      this.slideHeld = true;
      if (intro === 'slide-in') this.setControlsVisible(true); // animate in (unlocks when shown)
    }

    this.disposers.push(() => renderer.off('resize', onResize), unsubScreen);

    this._eventLog = new EventLog(this.ui.bus);

    if (this.opts.expose ?? true) this.expose();
  }

  /**
   * Build the unified scrollable MENU bound to the ☰ panel. Composed `menu` blocks
   * are given by `mountHud`; absent → a default Settings-only menu. Built-in ids
   * ('music'/'sfx') are reused, not shadowed (P10); button blocks wire `closePanel`.
   */
  private buildMenu(ticker: Application['ticker']): ControlView {
    const menu = this.opts.menu && this.opts.menu.length ? this.opts.menu : composeMenu(undefined, {});
    const controls = buildBlocks(menu, this.ui.bus, undefined, (id) => this.ui.control(id));
    for (const c of controls) if (!this.ui.control(c.id)) this.ui.register(c);
    const buttons = buttonBlocks(menu);
    this.disposers.push(
      this.ui.bus.on('buttonActivated', ({ id }) => {
        const b = buttons.find((x) => x.id === id);
        if (b?.action === 'closePanel') this.ui.settingsPanel.closePanel();
      }),
    );
    return new MenuView(this.ui.settingsPanel, controls, menu, this.ui, ticker, {
      controlSkins: this.opts.controlSkins,
      title: this.opts.menuTitle,
    });
  }

  /**
   * Slide the whole interactive HUD in (`true`) or out (`false`): bottom-anchored
   * controls travel down, top-anchored travel up (behind the status-bar plaque).
   * Pure translation (no scaling); controls are non-interactive while moving/hidden.
   */
  setControlsVisible(visible: boolean): void {
    const target = visible ? 0 : 1;
    this.slideTarget = target;
    // non-interactive while moving/hidden — hold the ref-counted input lock
    if (!this.slideHeld) {
      this.ui.lock();
      this.slideHeld = true;
    }
    const settle = (): void => {
      // fully shown → release the lock; fully hidden → stay locked
      if (this.slideProg === 0 && this.slideHeld) {
        this.ui.unlock();
        this.slideHeld = false;
      }
    };
    if (!this.appTicker) {
      this.slideProg = target;
      this.applySlide();
      settle();
      return;
    }
    // Drive the slide from a wall-clock timestamp (not accumulated ticker deltas), so
    // it completes in a fixed real-time duration regardless of frame pacing.
    const from = this.slideProg;
    const startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.slideTickFn) this.appTicker.remove(this.slideTickFn);
    const tick = (): void => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : startMs + 360;
      const k = Math.min(1, (nowMs - startMs) / 360);
      this.slideProg = from + (target - from) * k;
      if (k >= 1) {
        this.slideProg = target;
        this.appTicker?.remove(tick);
        this.slideTickFn = undefined;
        settle();
      }
      this.applySlide();
    };
    this.slideTickFn = tick;
    this.appTicker.add(tick);
  }

  /** Apply the current slide progress: translate each interactive view toward its
   *  anchored edge (pure translation — no scaling). */
  private applySlide(): void {
    const off = easeInOutCubic(this.slideProg) * this.lastScreenH;
    for (const [view, baseY] of this.slideBaseY) {
      view.y = baseY + (this.slideSign.get(view) ?? 1) * off;
    }
  }

  unmount(): void {
    if (this.slideTickFn && this.appTicker) this.appTicker.remove(this.slideTickFn);
    this.slideTickFn = undefined;
    for (const v of this.views) v.dispose();
    this.views.length = 0;
    for (const o of this.overlays) o.dispose();
    this.overlays.length = 0;
    this._eventLog?.dispose();
    this._eventLog = undefined;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.root.destroyed) this.root.destroy({ children: true });
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__OPENUI__;
    }
  }

  private expose(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__OPENUI__ = {
      snapshot: () => this.ui.snapshot(),
      getState: (id: string) => this.ui.control(id)?.current ?? null,
      isInteractable: (id: string) => this.ui.control(id)?.interactable ?? false,
      isAnimating: (id: string) => this.ui.control(id)?.inspect().animating ?? false,
      bounds: (id: string) => this.ui.snapshot().find((s) => s.id === id)?.bounds ?? null,
      events: (since: number) => this._eventLog?.since(since) ?? [],
      controlsReady: () => this.slideProg < 0.001,
    };
  }
}
