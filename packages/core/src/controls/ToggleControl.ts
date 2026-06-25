import { Control, type StateMap } from '../control/Control';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface ToggleOptions {
  id: string;
  layout: LayoutSpec;
  /** Initial on/off. Default false. */
  on?: boolean;
}

/**
 * An on/off toggle (e.g. Turbo). State IS the value: `off` | `on`. Emits `toggled`.
 * The view skins each state (e.g. the Turbo off/on frames).
 */
export class ToggleControl extends Control {
  readonly states: StateMap = {
    off: { interactable: true, transition: new Squish(0.92, 110) },
    on: { interactable: true, transition: new Pulse(1.08, 150) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };

  constructor(opts: ToggleOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'switch', layout: opts.layout }, opts.on ? 'on' : 'off');
  }

  get isOn(): boolean {
    return this.current === 'on';
  }

  set(on: boolean): void {
    const next = on ? 'on' : 'off';
    if (next === this.current) return;
    this.setState(next);
    this.bus?.emit('toggled', { id: this.id, on });
  }

  /** Called by the view on a valid press-release. */
  toggle(): void {
    if (this.current === 'disabled') return;
    this.set(!this.isOn);
  }

  enable(): void {
    if (this.current === 'disabled') this.setState('off');
  }
  disable(): void {
    this.setState('disabled');
  }
}
