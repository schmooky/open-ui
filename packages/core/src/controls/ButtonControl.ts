import { Control, type StateMap } from '../control/Control';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface ButtonOptions {
  id: string;
  layout: LayoutSpec;
  /** Optional text label (e.g. "Rules"). */
  label?: string;
  /** ARIA-ish role; default 'button'. */
  role?: string;
}

/**
 * A generic tap button: idle / hover / pressed / disabled, emitting
 * `buttonActivated` on a valid press-release. Used for settings, rules, close, …
 */
export class ButtonControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true, transition: new Squish(0.94, 110) },
    hover: { interactable: true, transition: new Pulse(1.05, 140) },
    pressed: { interactable: true, transition: new Squish(0.88, 70) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };
  readonly label?: string;

  constructor(opts: ButtonOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: opts.role ?? 'button', layout: opts.layout }, 'idle');
    this.label = opts.label;
  }

  enable(): void {
    if (this.current === 'disabled') this.setState('idle');
  }
  disable(): void {
    this.setState('disabled');
  }

  /** The view calls this on a valid press-release. */
  activate(): void {
    if (this.interactable) this.bus?.emit('buttonActivated', { id: this.id });
  }
}
