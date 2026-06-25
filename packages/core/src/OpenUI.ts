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
import { defaultTheme, type Theme } from './theme/tokens';
import {
  computeScreen,
  defaultLayoutConfig,
  type LayoutConfig,
  type ScreenState,
} from './layout/screen';
import type { ControlSnapshot, OpenUIEvents } from './types';
import type { UISpec } from './spec/types';
import { DictionaryTranslator, type Translator } from './i18n/translator';

export interface OpenUIOptions {
  theme?: Theme;
  layout?: LayoutConfig;
  /** i18n port. Default: an empty dictionary on locale 'en' (keys fall through). */
  translator?: Translator;
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
  readonly rulesButton: ButtonControl;
  readonly infoPanel: PanelControl;
  readonly infoClose: ButtonControl;
  readonly turbo: TurboControl;
  readonly autoplay: AutoplayControl;
  readonly bonusButton: ButtonControl;
  readonly betStepper: StepperControl;
  readonly betPlus: ButtonControl;
  readonly betMinus: ButtonControl;

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
      label: 'Balance',
      layout: { anchor: 'bottom-left', offset: [220, -96] },
      currency: { code: 'USD', decimals: 2 },
      initial: 1000,
      digits: 9,
    });
    this.bet = new ValueDisplay({
      id: 'bet',
      label: 'Bet',
      layout: { anchor: 'bottom-right', offset: [-220, -96] },
      currency: { code: 'USD', decimals: 2 },
      initial: 1,
      digits: 9,
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
    this.rulesButton = new ButtonControl({ id: 'rules', label: 'Rules', layout: { anchor: 'center' } }, this.bus);

    // the full-screen rules/info modal + its close button
    this.infoPanel = new PanelControl({ id: 'info-panel', variant: 'modal', title: 'Game Info', layout: { anchor: 'center' } }, this.bus);
    this.infoClose = new ButtonControl({ id: 'info-close', layout: { anchor: 'top-right' } }, this.bus);

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

    for (const c of [
      this.spin,
      this.balance,
      this.bet,
      this.settingsButton,
      this.settingsPanel,
      this.musicSlider,
      this.sfxSlider,
      this.rulesButton,
      this.infoPanel,
      this.infoClose,
      this.bonusButton,
      this.autoplay,
      this.turbo,
      this.betMinus,
      this.betPlus,
      this.betStepper,
    ]) {
      this.register(c);
    }

    // the library owns this navigation (a biased, stateful UI)
    this.bus.on('buttonActivated', ({ id }) => {
      if (id === 'settings') this.settingsPanel.toggle();
      else if (id === 'rules') {
        this.settingsPanel.closePanel();
        this.infoPanel.openPanel();
      } else if (id === 'info-close') {
        this.infoPanel.closePanel();
      } else if (id === 'bet-plus') {
        this.betStepper.inc();
      } else if (id === 'bet-minus') {
        this.betStepper.dec();
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

  /** Translate a key (or pass plain text through) via the active translator. */
  t(key: string, vars?: Record<string, string | number>): string {
    return this.translator.t(key, vars);
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
