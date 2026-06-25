import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

/**
 * The spin control — the vertical-spine exemplar.
 * A full state machine: each state declares interactability + an entry transition.
 * The game drives it via the façade (`busy/idle/stop/disable`); the view drives
 * the transient input states (`hover/pressed`) and calls `activate()` on release.
 */
export class SpinControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true, transition: new Squish(0.94, 120) },
    hover: { interactable: true, transition: new Pulse(1.06, 160) },
    pressed: { interactable: true, transition: new Squish(0.86, 70) },
    // Spinning no longer rotates — the button just squishes on press and sits.
    spinning: { interactable: false, transition: new Squish(0.94, 120) },
    stop: { interactable: true, transition: new Pulse(1.08, 140) },
    auto: { interactable: true, transition: new Pulse(1.06, 160) },
    disabled: { interactable: false, transition: new Fade(0.4, 160) },
  };

  /**
   * When true, the view arms press-and-hold: holding the spin button fires a
   * `holdSpinStarted` and the host turbo-spins until release (`holdSpinStopped`).
   * A quick tap still spins once. Toggleable via the `spin.press` config.
   */
  holdToSpin = false;

  /**
   * Whether tapping mid-spin slam-stops/skips the reels. Stake Engine's
   * `disabledSlamstop` jurisdiction flag sets this false → the button then LOCKS
   * (dims, no tap) during a spin instead of skipping. Observable so the view can
   * re-dim if it flips at runtime (e.g. on `applyJurisdiction`).
   */
  readonly allowSlamStop = new Signal<boolean>(true);

  /**
   * Whether the keyboard (Space / Enter) can trigger a spin. Stake's
   * `disabledSpacebar` sets this false (and turns off hold-to-spin). The renderer
   * reads it; RTS 14D requires a fresh press per cycle (no auto-repeat).
   */
  readonly allowKeyboard = new Signal<boolean>(true);

  constructor(
    opts: { id?: string; layout: LayoutSpec; holdToSpin?: boolean },
    private readonly bus: EventBus<OpenUIEvents>,
  ) {
    super({ id: opts.id ?? 'spin', role: 'button', layout: opts.layout }, 'idle');
    this.holdToSpin = opts.holdToSpin ?? false;
  }

  /**
   * Derived (Charter P6), with the slam-stop guard folded in: when slam-stop is
   * disabled, the in-spin `stop`/`auto` affordance is locked — the button can't be
   * tapped to skip; it just dims.
   */
  override get interactable(): boolean {
    if (!this.allowSlamStop.get() && (this.current === 'auto' || this.current === 'stop')) return false;
    return super.interactable;
  }

  // ---- façade (the game talks to these) ----
  busy(): void {
    this.setState('spinning');
  }
  idle(): void {
    this.setState('idle');
  }
  stopState(): void {
    this.setState('stop');
  }
  /** Show the autoplay-engaged look (press to stop). */
  auto(): void {
    this.setState('auto');
  }
  enable(): void {
    if (this.current === 'disabled') this.setState('idle');
  }
  disable(): void {
    this.setState('disabled');
  }

  // ---- input (the view calls this on a valid press-release) ----
  activate(): void {
    if (this.current === 'auto') {
      // autoplay-engaged: tapping slam-stops / skips the reels — it does NOT stop
      // autoplay. Suppressed when slam-stop is disabled by jurisdiction.
      if (this.allowSlamStop.get()) this.bus.emit('skipRequested', undefined);
      return;
    }
    if (this.interactable) this.bus.emit('spinRequested', undefined);
  }

  /** View calls this when a press is held past the hold threshold. Returns whether
   *  hold-to-spin engaged (so the view knows to wait for release). */
  holdBegin(): boolean {
    if (!this.holdToSpin || !this.interactable) return false;
    this.bus.emit('holdSpinStarted', undefined);
    return true;
  }
  /** View calls this on release after a hold — the host stops the turbo loop. */
  holdEnd(): void {
    this.bus.emit('holdSpinStopped', undefined);
  }
}
